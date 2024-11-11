require("dotenv").config()
const bulk = require("./bulkDownload.js")
const path = require("path")
const axios = require("axios")
const jsondb = require("node-json-db")
const fs = require('fs-extra')
const cron = require("node-cron")
const crypto = require("crypto")
const noblox = require("noblox.js")
noblox.setCookie(process.env.COOKIE)
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
const db = new jsondb.JsonDB(new jsondb.Config("database", true, true, "/", true))
const {
	REST,
	Routes
} = require('discord.js');
const rest = new REST({
	version: '10'
}).setToken(process.env.TOKEN);

const commands = [
	{
		name: "track",
		description: "Start tracking an asset",
		contexts: [0, 1, 2],
		integration_types: [0, 1],
		options: [
			{
				name: "id",
				description: "Asset ID",
				type: 4,
				required: true
			},
			{
				name: "name",
				type: Discord.ApplicationCommandOptionType.String,
				required: false,
				description: "Allows you to manually set a name for the asset, otherwise it'll use the one from Roblox"
			},
			{
				name: "channel",
				description: "If this isn't set, it'll just use the current channel",
				type: 7
			}
		],
		default_member_permissions: 8
	}
]

Client.on('ready', async () => {
	console.log(`Logged in as ${Client.user.displayName}`)
	downloadFiles()
	cron.schedule("0 * * * *", downloadFiles)
	console.log("Started Cron Job!")
	await (async () => {
		try {
			//Global
			console.log(`Registering global commands`);
			await rest.put(Routes.applicationCommands(Client.user.id), { body: commands })
		} catch (error) {
			console.error(error);
		}
	})();
});
Client.on("interactionCreate", async (interaction) => {
	if (!interaction.isCommand()) return;
	switch (interaction.commandName) {
		case "track":
			assetId = interaction.options.getInteger("id");
			if (!assetId) return interaction.reply({ ephemeral: true, content: "How'd you even manage to run this without sending an ID. Whatever, put an ID in dingus." });
			channel = interaction.options.getChannel("channel") || interaction.channel
			await interaction.deferReply({ ephemeral: true })
			assetInfo = await bulk.fetchAssetInfo({[assetId]: true})
			productName = interaction.options.getString("name") || assetInfo[assetId].asset.name
			db.push(`/ids/${assetId}`, {
				"name": productName,
				"hash": "",
				"discord_channel": channel.id,
				"filesize": 0
			})
			downloadFiles(assetId.toString()).then(() => {
				interaction.editReply({ ephemeral: true, content: "Done!" })
			})
			break;
	}
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

const downloadFiles = async (ovr) => {
	try {
		const dbData = await db.getData("/ids");
	} catch {
		return console.log("No DB, add an asset perhaps?")
	}
	const ids = ovr ? { [ovr]: dbData[ovr] } : null || dbData
	const data = await bulk.bulk(Object.keys(ids).map(id => id));
	const assetInfo = await bulk.fetchAssetInfo(ids)
	const fileDownloadPromises = Object.keys(data.data).map(async (id) => {
		channel = await Client.channels.fetch(ids[id].discord_channel)
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
								file = new Discord.AttachmentBuilder(Buffer.from(fs.readFileSync(filePath)), { name: fileName })
								channel.send({
									embeds: [{
										color: 0x00ff00,
										title: assetInfo[id].asset.name,
										url: `https://create.roblox.com/store/asset/${id}`,
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
												inline: true
											},
											{
												name: "New Filesize",
												value: humanFileSize(size),
												inline: true
											},
											{
												name: "Asset Name",
												value: assetInfo[id].asset.name,
												inline: true
											},
											{
												name: "Asset ID",
												value: `\`${id}\``,
												inline: true
											},
											{
												name: "Creator",
												value: `[${assetInfo[id].creator.name}](https://roblox.com/${assetInfo[id].creator.type == 2 ? "groups" : "users"}/${assetInfo[id].creator.id}/profile)`,
												inline: true
											},
											{
												name: "Asset Description",
												value: assetInfo[id].asset.description,
												inline: false
											},
											{
												name: "Timestamps",
												value: `Created: <t:${Math.floor(new Date(assetInfo[id].asset.createdUtc) / 1000)}>\nUpdated: <t:${Math.floor(new Date(assetInfo[id].asset.updatedUtc) / 1000)}>`,
												inline: true
											}
										]
									}],
									files: [file]
								})

								// Update the hash in the database
								db.push(`/ids/${id}/hash`, hash);
								db.push(`/ids/${id}/filesize`, size)
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
			channel.send({
				embeds: [
					{
						title: `Error!`,
						color: 0xff0000,
						description: `An error occured while trying to check for new versions of this asset!`,
						fields: [
							{
								name: "Error",
								value: `${fileData.code} ${fileData.message}\n\`${fileData.additional}\``
							}
						]
					}
				]
			})
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


Client.login(process.env.TOKEN)