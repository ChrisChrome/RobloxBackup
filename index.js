require("dotenv").config()
const bulk = require("./bulkDownload.js")
const path = require("path")
const axios = require("axios")
const http = require("http")
const git = require("isomorphic-git")
const jsondb = require("node-json-db")
const db = new jsondb.JsonDB(new jsondb.Config("database", true, true, "/", true))
const fs = require('fs-extra')
const cron = require("node-cron")
const crypto = require("crypto")
const { exec } = require('child_process')

// Git repo setup
const gitRepoDir = './git'

if (!fs.existsSync(gitRepoDir)) {
	fs.mkdirSync(gitRepoDir)
	git.init({
		fs,
		dir: gitRepoDir
	})
}
// if (!fs.existsSync(path.join(gitRepoDir, "/.git/refs/remotes/"))) {
// 	git.addRemote({
// 		fs,
// 		dir: gitRepoDir,
// 		remote: 'origin',
// 		url: process.env.GIT_REPO
// 	})
// }
if (!fs.existsSync("./tmp/")) {
    fs.mkdirSync("./tmp/")
} else {
    fs.rmSync("./tmp/", {recursive: true, force: true})
    fs.mkdirSync("./tmp/")
}

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

const saveToGitRepo = async (filePath, fileName, id) => {
    const repoDir = path.resolve(gitRepoDir)
    const fileDestination = path.join(repoDir, fileName)

    // Copy the file to the Git repository
    await fs.copy(filePath, fileDestination)
    console.log(`File ${fileName} copied to Git repository`)

    // Stage the file in git
    await git.add({
        fs,
        dir: repoDir,
        filepath: fileName
    })

    // Commit the changes
    const commitMessage = `Updated ${fileName} for ID: ${id}`
    await git.commit({
        fs,
        dir: repoDir,
        author: { name: 'Roblox Tracker', email: 'roblox-autogit@kcadev.org' }, // Adjust as necessary
        message: commitMessage,
		ref: "main"
    })

}

const downloadFiles = async () => {
    const ids = await db.getData("/ids")
    const data = await bulk(Object.keys(ids).map(id => id))
    
    for (const id in data.data) {
        const fileData = data.data[id]
        
        if (fileData.status === 'success') {
            try {
                const { url, type } = fileData
                const fileName = `${ids[id].name}.${type.ext}`
                const filePath = path.join('./tmp', fileName)

                // Download the file using axios
                const response = await axios.get(url, { responseType: 'stream' })

                // Pipe the data to the file path
                const writer = fs.createWriteStream(filePath)
                response.data.pipe(writer)

                writer.on('finish', async () => {
                    console.log(`Downloaded file: ${fileName}!`)
                    const hash = await hashFile(filePath)

                    if (hash !== ids[id].hash) {
                        console.log(`File ${fileName} has changed, saving to Git repo...`)
                        await saveToGitRepo(filePath, fileName, id)

                        // Update the hash in the database
                        db.push(`/ids/${id}/hash`, hash)
                    } else {
                        console.log(`No changes for file ${fileName}`)
                    }
                })

                writer.on('error', (err) => {
                    console.error(`Error downloading file ${fileName}: ${err.message}`)
                })
            } catch (error) {
                console.error(`Error processing file ${id}: ${error.message}`)
            }
        } else {
            console.log(`Failed to download file for ID: ${id}`)
        }
    }
}

// const pushChanges = async () => {
// 	//if (!process.env.GIT_TOKEN) return false;
// 	console.log("Attempting to push!")
// 	try {
		
//         await git.push({
//             fs,
// 			http,
// 			url: process.env.GIT_REPO,
			
//             dir: gitRepoDir,
//             remote: 'origin',
//             ref: 'main', // or 'master' depending on your repo
// 			username: process.env.GIT_USERNAME,
// 			token: process.env.GIT_TOKEN,
// 			force: true
//         })
//         console.log(`Update for ${new Date().toUTCString()}`)
//     } catch (error) {
//         console.error(`Error pushing changes: ${error.message}`)
//     }
// }

const main = async () => {
	downloadFiles().then(() => {
		// pushChanges()
	})
}

main()