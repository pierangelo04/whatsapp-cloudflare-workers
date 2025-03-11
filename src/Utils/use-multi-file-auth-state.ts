/*CF import AsyncLock from 'async-lock' */
/*CF import { mkdir, readFile, stat, unlink, writeFile } from 'fs/promises' */
import { join } from 'path'
/*CF import { proto } from '../../WAProto' */
import { AuthenticationCreds, AuthenticationState, SignalDataTypeMap } from '../Types'
import { initAuthCreds } from './auth-utils'
import { BufferJSON } from './generics'
import { R2Bucket, R2PutOptions } from '@cloudflare/workers-types' //CF
import { credsJsonStatus, logForDevelopment } from '..'

// We need to lock files due to the fact that we are using async functions to read and write files
// https://github.com/WhiskeySockets/Baileys/issues/794
// https://github.com/nodejs/node/issues/26338
// Default pending is 1000, set it to infinity
// https://github.com/rogierschouten/async-lock/issues/63
/*CF const fileLock = new AsyncLock({ maxPending: Infinity }) */

/**
 * stores the full authentication state in a single folder.
 * Far more efficient than singlefileauthstate
 *
 * Again, I wouldn't endorse this for any production level use other than perhaps a bot.
 * Would recommend writing an auth state for use with a proper SQL or No-SQL DB
 * */
export const useMultiFileAuthState = async(folder: string, R2Bucket: R2Bucket): Promise<{ state: AuthenticationState, saveCreds: () => Promise<void> }> => { //CF
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	/*CF const writeData = (data: any, file: string) => {
		const filePath = join(folder, fixFileName(file)!)
		return fileLock.acquire(
			filePath,
			() => writeFile(join(filePath), JSON.stringify(data, BufferJSON.replacer))
		)
	} */

	/*CF const readData = async(file: string) => {
		try {
			const filePath = join(folder, fixFileName(file)!)
			const data = await fileLock.acquire(
				filePath,
				() => readFile(filePath, { encoding: 'utf-8' })
			)
			return JSON.parse(data, BufferJSON.reviver)
		} catch(error) {
			return null
		}
	} */

	/*CF const removeData = async(file: string) => {
		try {
			const filePath = join(folder, fixFileName(file)!)
			await fileLock.acquire(
				filePath,
				() => unlink(filePath)
			)
		} catch{

		}
	} */

	/*CF const folderInfo = await stat(folder).catch(() => { })
	if(folderInfo) {
		if(!folderInfo.isDirectory()) {
			throw new Error(`found something that is not a directory at ${folder}, either delete it or specify a different location`)
		}
	} else {
		await mkdir(folder, { recursive: true })
	} */

	const writeData = async (data: any, file: string) => {
		const filePath = join(join(folder, fixFileName(file)!))
		const dataFormatted = JSON.stringify(data, BufferJSON.replacer)
		if (logForDevelopment.show) console.log('WARNING [writeData()] content of creds.js', '[data]', data) //CF
		if (logForDevelopment.show) console.log('WARNING [writeData()] content of creds.js]', '[folder]', folder) //CF

		let customMetadata: Record<string, string> = {}

		if (logForDevelopment.show) console.log('WARNING [writeData()] await R2Bucket.head', '[filePath]', filePath) //CF
		const verifyExist = await R2Bucket.head(filePath)
		if (!verifyExist) {
			customMetadata.userBot = filePath?.split("/")?.slice(-2, -1)?.[0] || 'not found'
			customMetadata.phone = data?.me?.id?.split(":")?.[0] || data?.id || 'not found'
			customMetadata.path = filePath || 'not found'
			customMetadata.created = new Date().toISOString()
		}

		else {
			customMetadata = verifyExist?.customMetadata || {}
			customMetadata.name = data?.me?.name || verifyExist?.customMetadata?.name || 'not found'
		}
		if (logForDevelopment.show) console.log('WARNING [writeData()] await R2Bucket.head', '[verifyExist]', verifyExist) //CF

		if (logForDevelopment.show) console.log('WARNING [writeData()] await R2Bucket.put', '[filePath]', filePath) //CF
		if (logForDevelopment.show) console.log('WARNING [writeData()] await R2Bucket.put', '[customMetadata]', customMetadata) //CF
		const resultR2BucketPut = await R2Bucket.put(filePath, dataFormatted, {
			customMetadata: customMetadata
		})
		credsJsonStatus.update = true

		if (logForDevelopment.show) console.log('WARNING [writeData()] await R2Bucket.get', '[filePath]', filePath) //CF
		const resultR2BucketGet = await R2Bucket.get(filePath)

		if (logForDevelopment.show) console.log('WARNING [writeData()] await R2Bucket.put', '[resultR2BucketPut]', resultR2BucketPut) //CF
		if (logForDevelopment.show) console.log('WARNING [writeData()] await R2Bucket.get', '[resultR2BucketGet]', resultR2BucketGet) //CF
	}

	const readData = async(file: string) => {
		try {
			const filePath = join(folder, fixFileName(file)!)

			if (logForDevelopment.show) console.log('WARNING [readData()] await R2Bucket.get', '[filePath]', filePath) //CF

			const resultGetR2  = await R2Bucket.get(filePath)
			if (logForDevelopment.show) console.log('WARNING [readData()] await R2Bucket.get', '[resultGetR2]', resultGetR2) //CF
			if (!resultGetR2) { return null }

			const data = await resultGetR2.text()
			if (logForDevelopment.show) console.log('WARNING [readData()] await resultGetR2.text', '[resultGetR2]', data) //CF

			const resultGetR2Parse = JSON.parse(data, BufferJSON.reviver)
			if (logForDevelopment.show) console.log('WARNING [readData()] JSON.parse', '[resultGetR2Parse]', resultGetR2Parse) //CF

			return resultGetR2Parse
		} catch(error) {
			return null
		}
	}

	const removeData = async(file: string) => {
		try {
			const filePath = join(folder, fixFileName(file)!)
			if (logForDevelopment.show) console.log('WARNING [removeData()] await R2Bucket.delete', '[filePath]', filePath) //CF
			await R2Bucket.delete(filePath)
			if (logForDevelopment.show) console.log('WARNING [removeData()] await R2Bucket.delete', '[void]', void 0) //CF
		} catch{

		}
	}

	const fixFileName = (file?: string) => file?.replace(/\//g, '__')?.replace(/:/g, '-')

	const creds: AuthenticationCreds = await readData('creds.json') || initAuthCreds()

	return {
		state: {
			creds,
			keys: {
				get: async(type, ids) => {
					/*CF const data: { [_: string]: SignalDataTypeMap[typeof type] } = { }
					await Promise.all(
						ids.map(
							async id => {
								let value = await readData(`${type}-${id}.json`)
								if(type === 'app-state-sync-key' && value) {
									value = proto.Message.AppStateSyncKeyData.fromObject(value)
								}

								data[id] = value
							}
						)
					)

					return data */

					//CF \/
					const data: { [_: string]: SignalDataTypeMap[typeof type] } = { }
					ids.map(
						id => {
							let value = null as any
							data[id] = value
						}
					)
					//CF /\

					return data
				},
				set: async(data) => {
					/*CF const tasks: Promise<void>[] = []
					for(const category in data) {
						for(const id in data[category]) {
							const value = data[category][id]
							const file = `${category}-${id}.json`
							tasks.push(value ? writeData(value, file) : removeData(file))
						}
					}

					await Promise.all(tasks) */

					return void 0 //CF
				}
			}
		},
		saveCreds: async () => { //CF
			return await writeData(creds, 'creds.json') //CF
		}
	}
}
