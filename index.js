require("dotenv").config()
const bulk = require("./bulkDownload.js")
const path = require("path")
const axios = require("axios")
const jsondb = require("node-json-db")
const db = new jsondb.JsonDB(new jsondb.Config("database", true, true, "/", true))
const fs = require('fs-extra')
const crypto = require("crypto")
console.log(fs.readdirSync("."))
if (!fs.existsSync("./tmp/")) {
    fs.mkdirSync("./tmp/")
} else {
    fs.rmSync("./tmp/", {recursive: true, force: true})
    fs.mkdirSync("./tmp/")
}

if (!fs.existsSync("./backups/")) {
    fs.mkdirSync("./backups/")
}

const Discord = require("discord.js")
const hook = new Discord.WebhookClient({ url: process.env.WEBHOOK })

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
                                console.log(`File ${fileName} has changed, saving to Git repo...`);
								hook.send({
									embeds: [{
										color: 0x00ff00,
										title: fileName,
										url: `https://github.com/${process.env.GITHUB_REPOSITORY}`,
										description: `File has changed!`,
										fields: [
											{
												name: "Old Hash",
												value: ids[id].hash
											},
											{
												name: "New Hash",
												value: hash
											}
										],
										timestamp: new Date()
									}]
								})
                                await fs.copyFile(filePath, path.join(__dirname, "/backups/", fileName))

                                // Update the hash in the database
                                db.push(`/ids/${id}/hash`, hash);
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


const main = async () => {
	await downloadFiles()
}

main()