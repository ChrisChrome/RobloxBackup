const codes = require("./codes.json")
const assetTypes = require("./assetTypes.json")
bulk = async (assetIds, inputCookie) => {
	console.log(process.env.COOKIE)
	// Impliment a rate limit of 25 requests per minute
	if (!assetIds || !Array.isArray(assetIds)) {
		return {
			error: "Invalid data format",
			status: "error"
		};
	}

	// Build the batch request body
	const batchRequests = assetIds.map(item => {
		const assetId = item;

		if (!assetId) {
			return {
				assetId,
				requestId: assetId,
				status: "failure",
				additional: "Missing assetId."
			};
		}

		return {
			assetId,
			requestId: assetId
		};
	});

	// If body.cookie is provided, use it, else use process.env.COOKIE
	const cookie = inputCookie || process.env.COOKIE;

	const options = {
		method: 'POST',
		headers: {
			authority: 'assetdelivery.roblox.com',
			accept: '',
			'accept-language': 'en-US,en;q=0.9',
			'cache-control': 'no-cache',
			'content-type': 'application/json',
			origin: 'https://create.roblox.com',
			pragma: 'no-cache',
			referer: 'https://create.roblox.com/',
			'roblox-browser-asset-request': 'true',
			'roblox-place-id': '0',  // Use a default or placeholder value if needed
			'sec-ch-ua': '"Opera GX";v="105", "Chromium";v="119", "Not?A_Brand";v="24"',
			'sec-ch-ua-mobile': '?0',
			'sec-ch-ua-platform': '"Windows"',
			'sec-fetch-dest': 'empty',
			'sec-fetch-mode': 'cors',
			'sec-fetch-site': 'same-site',
			'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0',
			Cookie: `.ROBLOSECURITY=${cookie};`
		},
		body: JSON.stringify(batchRequests)
	};

	try {
		let response = await fetch("https://assetdelivery.roblox.com/v1/assets/batch", options);
		let json = await response.json();
		//console.log(JSON.stringify(json, null, 2));
		// Build the response object
		const responses = assetIds.reduce((acc, item, index) => {
			const assetId = item;
			if (json[index].errors) {
				const errorCode = json[index].errors[0].code;
				acc[assetId] = {
					status: "failure",
					code: errorCode,
					message: codes[errorCode].message,
					additional: codes[errorCode].description
				};
			} else {
				acc[assetId] = {
					status: "success",
					url: json[index].location,
					type: assetTypes[json[index].assetTypeId]
				};
			}
			return acc;
		}, {});

		return {
			type: "batching-response",
			data: responses
		};

	} catch (error) {
		console.error(error.stack)
		return {
			type: "batching-response",
			data: assetIds.reduce((acc, item) => {
				acc[item] = {
					status: "failure",
					url: "",
					additional: "Request failed"
				};
				return acc;
			}, {})
		};
	}
}

module.exports = bulk;