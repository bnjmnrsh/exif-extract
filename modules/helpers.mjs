import * as typedefs from './typedefs.mjs'
import { defaults } from './default-options.mjs'
import fs from 'fs'
import path from 'path'

/**
 * Helper to check if a value is an object.
 *
 * @param {*} value - The value to check.
 * @returns {Boolean} True if the value is an object, false otherwise.
 */
function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Checks if a file or directory path is valid and writable.
 *
 * @param {String} filePath - The path to check for write-ability.
 * @param {typedefs.Options} opts - An options object containing the following properties:
 *   - rootDir: The absolute path to the project directory.
 *   - srcDir: Relative path of directory to traverse.
 *   - outputPath: A relative or absolute path to write JSON output, with filename.
 *   - tagOptions: An array of EXIF tags to extract.
 *   - validExtensions: An array of valid media extensions.
 *
 * @return {Boolean} Returns true if the path is writable, false otherwise.
 *
 * @throws {Error} Throws an error if the path is not a valid path or does not have write permissions.
 */
function checkPathPermisions(filePath, opts) {
  try {
    // Get the key name as a string
    const keyName = Object.entries(opts).find(([, v]) => v === filePath)?.[0]

    if (!filePath || typeof filePath !== 'string') {
      throw new Error(
        `${keyName} must be a string. Received: ${typeof keyName}`
      )
    }

    // Check if the path is valid
    fs.access(path.dirname(filePath), fs.constants.W_OK, (err) => {
      if (err) {
        console.error(`${path.dirname(filePath)} is not writable`)
        throw new Error(
          `${keyName} is not a valid path or you don't have the correct permissions? Received: ${JSON.stringify(
            filePath
          )}`
        )
      } else {
        return true
      }
    })
  } catch (error) {
    throw new Error(error)
  }
}

/**
 *  Validate options. Throws if the options object is not formed correctly, or returns the validated options object.
 *
 * @param {typedefs.Options} opts - An options object containing the following properties:
 *   - rootDir: The absolute path to the project directory.
 *   - srcDir: Relative path of directory to traverse.
 *   - outputPath: A relative or absolute path to write JSON output, with filename.
 *   - tagOptions: An array of EXIF tags to extract.
 *   - validExtensions: An array of valid media extensions.
 *
 * @returns {typedefs.Options} opts
 *
 * @throws {Error} Throws an error if the options object is missing or not an object.
 * @throws {Error} Throws an error if the rootDir, srcDir, or outputPath property is missing or invalid.
 * @throws {Error} Throws an error if the tagOptions property is present but not an array.
 * @throws {Error} Throws an error if the validExtensions property is present but not an array.
 */
function validateOptions(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new Error(
      'You must pass an options object minimally containing: "rootDir", "srcDir", and "outputPath" properties. Instead Received:',
      opts
    )
  }
  // validate required properties are present
  if (!opts.rootDir || !opts.srcDir || !opts.outputPath) {
    throw new Error(
      'You must pass an options object minimally containing: "rootDir", "srcDir", and "outputPath" properties.'
    )
  }

  // Validate rootDir is a valid path
  checkPathPermisions(opts.rootDir, opts)

  // Validate srcDir is a valid path
  checkPathPermisions(opts.srcDir, opts)

  // outputPath may be a relative path so check last as it needs a valid opts.rootDir to compute.
  if (path.isAbsolute(opts.outputPath)) {
    console.log('outputPath is absolute:', opts.outputPath)
    checkPathPermisions(opts.outputPath, opts)
  } else {
    const resolvedpath = path.resolve(opts.rootDir, opts.outputPath)
    checkPathPermisions(resolvedpath, opts)
  }
  // validate optional properties
  if (opts.tagOptions && !Array.isArray(opts.tagOptions)) {
    throw new Error(
      'tagOptions must be an array of Tag names, or Tag Options objects. Received:',
      JSON.stringify(opts.tagOptions)
    )
  }
  if (opts.validExtensions && !Array.isArray(opts.validExtensions)) {
    throw new Error(
      'validExtensions must be an array. Received:',
      JSON.stringify(opts.validExtensions)
    )
  }

  return opts
}

/**
 * Merge properties from the right-hand object into the left-hand object, but only if those properties already exist in the left-hand object.
 *
 * @param {Object} obj1 - Original or default object.
 * @param {Object} obj2 - A provided object.
 *
 *   - rootDir: The absolute path to the project directory.
 *   - srcDir: Relative path of directory to traverse.
 *   - outputPath: A relative or absolute path to write JSON output, with filename.
 *   - tagOptions: An array of EXIF tags to extract.
 *   - validExtensions: An array of valid media extensions.
 *
 * @returns {Object} A merged object.
 */
function conditionalRightHandMerge(obj1, obj2) {
  const merged = { ...obj1 }
  for (const key in obj1) {
    // only assign values for keys that exist in original object.
    if (obj2.hasOwnProperty(key)) {
      merged[key] = obj2[key]
    }
  }
  return merged
}

/**
 * Merge project defaults with user provided options.
 *
 * @param {typedefs.Options}
 * @returns {typedefs.Options} A merged options object.
 */
function mergeOptions(options) {
  const merged = conditionalRightHandMerge(defaults, options)

  // Throws if the provided options are not valid.
  validateOptions(merged)
  return merged
}

/**
 * Function to recursively traverse directories and return an array of all files that match any of the provided extensions.
 *
 * @param {String} dir - Absolute path of directory to traverse.
 * @param @param {Array.<String>} extensions - An array of valid extensions
 * @param @param {Array.<String>} filesList - An optional array of files
 *
 * @returns {Promise<Array.<Object>>} - The array of files
 */
async function getFiles(dir, extensions, filesList = []) {
  try {
    const files = await fs.promises.readdir(dir)
    for (const file of files) {
      if (file.startsWith('.')) {
        continue // Skip invisible files
      }

      const filePath = path.join(dir, file)
      const stat = await fs.promises.stat(filePath)

      if (stat.isDirectory()) {
        await getFiles(filePath, extensions, filesList)
      } else {
        const fileExtension = path.extname(filePath).toLowerCase()
        if (extensions.includes(fileExtension)) {
          filesList.push(filePath)
        }
      }
    }
    return filesList
  } catch (error) {
    console.error(error) // Log the error
    throw new Error(`Error reading directory: ${dir}`, error)
  }
}

/**
 * Writes a tag and its value to a file.
 *
 * @param {String} absFilePath - The absolute path of the file.
 * @param {String} tag - The tag to write.
 * @param {String} val - The value of the tag.
 *
 * @return {Promise<void>} A promise that resolves when the tag is successfully written to the file, or rejects with an error if there was a problem.
 */
async function writeTagToFile(absFilePath, tag, val) {
  try {
    await fs.promises.access(absFilePath, fs.constants.W_OK)
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`File does not exist: ${absFilePath}`)
    } else if (error.code === 'EACCES') {
      throw new Error(`File is not writable: ${absFilePath}`, error)
    } else {
      throw error
    }
  }
  try {
    console.log(
      `-- exiftool writing: ${tag} : ${val} \n   to file: ${absFilePath}` // fires
    )
    const result = await exiftool.write(absFilePath, { [tag]: val })
    console.warn(`-- exiftool reports: ${JSON.stringify(result)}`)
  } catch (error) {
    console.error('-- exiftool write error:', error)
    throw error
  }
}

/**
 * Writes a file to disk.
 * Warning will overwrite any existing file of the same name.
 *
 * @param {string} fileName - The name of the file.
 * @param {string} filePath - The path to the file to write.
 * @param {string} writeValue - The value to write to the file.
 * @param {boolean} [fileAppend=false] - A boolean indicating whether to append the writeValue to the file.
 * @param {string} [fileNamePrepend=null] - An optional string to prepend to the file name.
 *
 * @returns {Promise<void>} A promise that resolves when the file is written.
 *
 * @throws {TypeError} If writeValue is not a string.
 * @throws {TypeError} If the filePath is not a string.
 * @throws {TypeError} If the fileName is not a string.
 * @throws {TypeError} If the filePath is not writable.
 * @throws {TypeError} If fileNamePrepend is not a string.
 */
async function writeToFile(
  fileName,
  filePath,
  writeValue,
  fileAppend = false,
  fileNamePrepend = null
) {
  if (typeof writeValue !== 'string') {
    throw new TypeError('writeValue must be a string')
  }
  if (typeof filePath !== 'string') {
    throw new TypeError('filePath must be a string')
  }
  if (typeof fileName !== 'string') {
    throw new TypeError('fileName must be a string')
  }
  if (typeof fileAppend !== 'boolean') {
    throw new TypeError('fileAppend must be a boolean')
  }
  if (fileNamePrepend !== null && typeof fileNamePrepend !== 'string') {
    throw new TypeError('fileNamePrepend must be a string')
  }

  const newFileName = fileNamePrepend
    ? `${fileNamePrepend}${fileName}`
    : fileName
  const newFilePath = path.join(path.dirname(filePath), newFileName)

  try {
    await fs.promises.access(filePath, fs.constants.W_OK)
  } catch (error) {
    if (error.code === 'EACCES') {
      throw new Error(`File is not writable: ${filePath}`, error)
    }
    throw error
  }

  if (fileAppend) {
    await fs.promises.appendFile(newFilePath, writeValue)
  } else {
    await fs.promises.writeFile(newFilePath, writeValue)
  }
}

/**
 * An array of missing tags per media file.
 *
 * @type {Object.<string, { key: string, val: string }>} - An array of missing tags per media file.
 */
const missingTags = {}

/**
 * Extracts the file name from the absolute file path, constructs an error object with the file name as key, and pushes it to the tagErrors array.
 *
 * @param {String} absFilePath - The absolute file path.
 * @param {String} tag - The missing exif tag.
 * @param {String} val - The default value for the missing exif tag.
 *
 * @return {Void} This function does not return a value.
 */
function logMissingTag(absFilePath, tag, val) {
  // extract the file name from absFilePath
  const fileName = path.basename(absFilePath)

  if (!missingTags[fileName]) {
    missingTags[fileName] = {}
  }
  // push to the missingTags array
  missingTags[fileName][tag] = val
}

export {
  isObject,
  mergeOptions,
  conditionalRightHandMerge,
  validateOptions,
  writeTagToFile,
  logMissingTag,
  writeToFile,
  getFiles,
  missingTags
}
