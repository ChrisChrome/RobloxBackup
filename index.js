require("dotenv").config()
const bulk = require("./bulkDownload.js")
const path = require("path")
const axios = require("axios")
const jsondb = require("node-json-db")
const db = new jsondb.JsonDB(new jsondb.Config("database", true, true, "/", true))
const fs = require('fs-extra')
const cron = require("node-cron")
const crypto = require("crypto")
console.log(fs.readdirSync("."))
if (!fs.existsSync("./tmp/")) {
	fs.mkdirSync("./tmp/")
} else {
	fs.rmSync("./tmp/", { recursive: true, force: true })
	fs.mkdirSync("./tmp/")
}

if (!fs.existsSync("./backups/")) {
	fs.mkdirSync("./backups/")
}

const Discord = require("discord.js")
const Client = new Discord.Client({
	intents: [
		"Guilds"
	]
})

const hashFile = (filePath) => {
	return new Promise((resolve, reject) => {
		const hash = crypto.createHash('sha1')
		const stream = fs.createReadStream(filePath)

		stream.on('data', (chunk) => {
			hash.update(chunk)
		})

		stream.on('end', () => {
			resolve(hash.digest('hex'))
		})

		stream.on('error', (err) => {
			reject(`Error reading file: ${err.message}`)
		})
	})
}
function humanFileSize(bytes, si = false, dp = 1) {
	const thresh = si ? 1000 : 1024;

	if (Math.abs(bytes) < thresh) {
		return bytes + ' B';
	}

	const units = si
		? ['kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
		: ['KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
	let u = -1;
	const r = 10 ** dp;

	do {
		bytes /= thresh;
		++u;
	} while (Math.round(Math.abs(bytes) * r) / r >= thresh && u < units.length - 1);


	return bytes.toFixed(dp) + ' ' + units[u];
}

const downloadFiles = async () => {
	const ids = await db.getData("/ids");
	const data = await bulk(Object.keys(ids).map(id => id));

	const fileDownloadPromises = Object.keys(data.data).map(async (id) => {
		const fileData = data.data[id];

		if (fileData.status === 'success') {
			try {
				const { url, type } = fileData;
				const fileName = `${ids[id].name}.${type.ext}`;
				const filePath = path.join('./tmp', fileName);

				// Download the file using axios
				const response = await axios.get(url, { responseType: 'stream' });

				// Return a Promise that resolves when the file is downloaded and processed
				return new Promise((resolve, reject) => {
					const writer = fs.createWriteStream(filePath);
					response.data.pipe(writer);

					writer.on('finish', async () => {
						try {
							console.log(`Downloaded file: ${fileName}!`);
							const hash = await hashFile(filePath);

							if (hash !== ids[id].hash) {
								console.log(`File ${fileName} has changed`);
								size = fs.statSync(filePath).size
								channel = await Client.channels.fetch(ids[id].discord_channel)
								file = new Discord.AttachmentBuilder(Buffer.from(fs.readFileSync(filePath)), { name: fileName })
								channel.send({
									embeds: [{
										color: 0x00ff00,
										title: 'File Changed',
										url: `https://create.roblox.com/store/asset/${id}`,
										description: `ID: \`${id}\`\n<t:${Math.floor(new Date() / 1000)}:f>`,
										fields: [
											{
												name: "Old Hash",
												value: ids[id].hash,
												inline: true
											},
											{
												name: "New Hash",
												value: hash,
												inline: true
											},
											{
												name: "Old Filesize",
												value: humanFileSize(ids[id].filesize),
												inline: false
											},
											{
												name: "New Filesize",
												value: humanFileSize(size),
												inline: true
											}
										]
									}],
									files: [file]
								})

								// Update the hash in the database
								db.push(`/ids/${id}/hash`, hash);
								db.push('/ids/${id}/filesize', size)
							} else {
								console.log(`No changes for file ${fileName}`);
							}

							resolve(); // Resolve the Promise when all is done
						} catch (err) {
							reject(err); // Reject if there's an error during processing
						}
					});

					writer.on('error', (err) => {
						reject(new Error(`Error downloading file ${fileName}: ${err.message}`));
					});
				});
			} catch (error) {
				console.error(`Error processing file ${id}: ${error.message}`);
			}
		} else {
			console.log(`Failed to download file for ID: ${id}`);

		}
	});

	// Wait for all file download promises to complete
	try {
		await Promise.all(fileDownloadPromises);
		console.log('All files processed successfully!');
	} catch (error) {
		console.error('Error processing some files:', error);
	}
}

Client.on('ready', async () => {
	console.log(`Logged in as ${Client.user.displayName}`)
	await downloadFiles();
	cron.schedule("0 * * * *", downloadFiles)
	console.log("Started Cron Job!")
});

Client.login(process.env.TOKEN)