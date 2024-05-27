import fs from 'fs'
import { exiftool, ExifTool } from 'exiftool-vendored'
import path from 'path'
import { error, log } from 'console'
import { validateOptions } from './helpers.mjs'

/**
 * Extract metadata from images in a directory and return it as an object, or write to file as JSON.
 *
 * Note: there is a lot of unevenness between tags and media/file types file types, which tools like Bridge and exiftool try to normalize where possible.
 * For example .mp4 files don't have a Keywords tag, so instead eAdobe Bridge also writes to the 'Subject' tag as this tag has better availability across media.
 * Also tags differ widely between manufacturers and even models so test your use cases extensively.
 *
 * Writing:
 * When passing a an EXIF tag object with a write boolean set to true, the tag will be written to the media file if possible.
 *
 * Also note, not all tags such as camera metadata may be written to, while others appear quite differently to field names in Adobe Bridge.
 * For example, "Creator: Website(s)" in Adobe Bridge can be populated with the 'flattened' tag: "CreatorWorkURL" or 'xmp:CreatorWorkURL'.
 *
 * @see https://exiftool.org/#links
 * @see https://exiftool.org/TagNames/
 *
 * // Common tags
 * @see https://exiftool.org/TagNames/EXIF.html
 * @see https://exiftool.org/TagNames/XMP.html
 * @see https://exiftool.org/TagNames/IPTC.html
 *
 * Common media tags
 * @see https://exiftool.org/TagNames/JPEG.html
 * @see https://exiftool.org/TagNames/PNG.html
 * @see https://exiftool.org/TagNames/GIF.html
 * @see https://exiftool.org/TagNames/MPEG.html | MP3 (MPEG-1 layer 3 audio), MPEG-2, etc.
 * @see https://exiftool.org/TagNames/QuickTime.html | MPEG-4, Apple QuickTime, etc.
 *
 * @todo complete the use of fileWrite, by extracting the filename from the save path in both extractMetadataToJsonFile, and extractMetadata.
 * @todo add documentation on the asymmetry of tags like CreatorWorkURL and Creator: Website(s), and how they differ between Adobe Bridge
 * -- research this more.
 * @todo add filter to missing tags log that if its empty, don't write anything.
 * @todo add exception to exiftool reports, if it comes back with an error - throw(?) but def add to the log for that file
 * @todo we don't need to write to file for each tag on each file. Instead collect the write reports errors object, and write it at the end.
 * @todo in fact we might be able to collect all the writes and send them to exiftool in one go, and then process the results.
 *
 * @todo due to the the assymmetry of 'flattened' tags  --- a write action on one of these tags will always overwrite the origional value.
 * --- This is due to the flattened tag acting only as setter and not as a getter. Therefore the 'write' option will always be true due to the null check.
 */

/**
 * Type definition for an EXIF tag preference, which may be:
 *      - A string, the EXIF key name. This will simply include the tag value in the output, if it has been populated on the media file.
 *      - An object with the key and value. In this case, if the tag is not populated on the media file, the fallback value will be used if the key is not populated on the media file.
 *      - The value may also optionally be a key, with a val and write boolean. The write boolean is optional and defaults to false.
 *
 * @typedef {Object} ExifTag
 * @property {String | { [key: String]: { val: String, write?: Boolean } | null } } key - A string of EXIF key name, or an object with the key and value. The value may also optionally be a key, with a val and write boolean. The write boolean is optional and defaults to true.
 */

/**
 *  Type definition for user Options.
 *
 * @typedef {Object} Options - The default options.
 * @property {String} Options.srcDir - Relative path of directory to traverse.
 * @property {String} Options.outputPath - The relative path of the directory to write output.
 * @property {String} Options.fileName - The name of the output file with extension.
 * @property {Array.<ExifTag>} Options.exifTags - An array of EXIF tags to extract.
 * @property {Array.<string>} Options.validExtensions - An array of valid media extensions.
 */

/**
 * An array of missing tags per media file.
 *
 * @type {Object.<string, { key: string, val: string }>} - An array of missing tags per media file.
 */
const missingTags = {}

/**
 * Default options.
 *
 * @type {Options}
 */
const defaults = {
  __dirname: '',
  srcDir: '',
  outputPath: '',
  fileName: 'metadata.json',
  exifTags: [],
  validExtensions: ['.jpg', '.jpeg']
}

/**
 * Merge one object into another.
 *
 * @param {Options} orig - Original or default object.
 * @param {Options} provided - A provided object.
 *
 *   - __dirname: Absolute path to the relative project directory.
 *   - srcDir: Relative path of directory to traverse.
 *   - outputPath: A relative or absolute path to write JSON output, with filename.
 *   - exifTags: An array of EXIF tags to extract.
 *   - validExtensions: An array of valid media extensions.
 *
 * @returns {Options} A merged object.
 */
function mergeOptions(orig, provided) {
  // Throw if provided are not valid.
  validateOptions(provided)

  const mergedOptions = { ...orig }
  for (const key in provided) {
    if (provided.hasOwnProperty(key)) {
      mergedOptions[key] = provided[key]
    }
  }

  return mergedOptions
}

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
 * Function to traverse each file in a directory and extract tag metadata.
 * Allows for parallel processing of images by mapping over files and collecting the promises, and using Promise.allSettled
 *
 * @param {String} dir
 * @param {String} __dirname
 * @param {Array.<ExifTag>} exifTags
 * @param {Array.<string>} allowedMediaFileExtensions
 *
 * @returns {Promise<Array>} Array of objects with EXIF metadata from each media file.
 */
async function processDirectories(
  dir,
  __dirname,
  exifTags,
  allowedMediaFileExtensions
) {
  const files = await getFiles(dir, allowedMediaFileExtensions)

  if (files.length === 0) {
    throw new Error(`No media files found in ${dir}`)
  }
  const metadataPromises = files.map(
    async (file) => await gatherTags(file, __dirname, exifTags)
  )
  try {
    const metadataList = await Promise.allSettled(metadataPromises)
    // Filter out any potential empty values
    return metadataList.filter(Boolean).map((result) => result.value)
  } catch (err) {
    console.error(err)
    throw err
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

/**
 * Filters the metadata object by collecting the provided EXIF tags from an image's metadata.
 *
 * @param {string} absFilePath - The absolute path to the media file.
 * @param {string} __dirname - The absolute path to the project directory.
 * @param {Array.<string|Object>} [exifTags=[]] - The EXIF tags to filter.
 *
 * @returns {Promise<Object|Error>} - The filtered metadata object or an error.
 *
 * @throws {Error} - If there is an error reading the metadata.
 */
async function gatherTags(absFilePath, __dirname, exifTags = []) {
  try {
    console.log('Reading:', absFilePath)

    const exiftoolA = new ExifTool({ Struct: 2 })
    const metadata = await exiftoolA.read(absFilePath) // metadata object from media file
    let filteredMetadata = {}

    if (exifTags.length) {
      for (const entry of exifTags) {
        const tag = typeof entry === 'string' ? entry : Object.keys(entry)[0] // get the current tag name to check
        const val = isObject(entry) ? entry[tag]?.val : entry[tag] // get the tag fallback value

        if (
          metadata[tag] === undefined ||
          metadata[tag] === null ||
          /^\s*$/.test(metadata[tag]) // contains only whitespace
        ) {
          if (isObject(entry) && !entry[tag].hasOwnProperty('val')) {
            // if entry is an object and does not contain a 'val' property
            filteredMetadata[tag] = entry[tag]
          } else if (isObject(entry) && entry[tag].hasOwnProperty('val')) {
            // if entry is an object and contains a 'val' property
            filteredMetadata[tag] = val

            console.log('tagname:', tag)
            console.log('tag value on file:', metadata[tag])
            console.log('tag fallback value:', metadata[tag])

            if (entry[tag].write) {
              //   await writeTagToFile(absFilePath, tag, val)
              logMissingTag(absFilePath, tag, val)
              console.warn(
                `-- exiftool writing: ${tag} : current value is ${metadata[tag]}::${val}`
              )
            }
          }
        } else {
          if (metadata[tag]) {
            filteredMetadata[tag] = metadata[tag]
          }
        }
      }
    } else {
      // We've not passed a filter so return all metadata.
      filteredMetadata = metadata
    }
    filteredMetadata.SourceFile = path.relative(__dirname, absFilePath)
    filteredMetadata.Directory = path.relative(
      __dirname,
      path.dirname(absFilePath)
    )
    return filteredMetadata
  } catch (error) {
    console.error(`Error reading metadata for ${absFilePath}:`, error)
    await exiftool.end()
    throw new Error(`Error reading metadata for ${absFilePath}:`, error)
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
 * Extract metadata from images in a directory and return it as an object.
 *
 * @param {Options} opts - An options object containing the following properties:
 *   - __dirname: Absolute path to the relative project directory.
 *   - srcDir: Relative path of directory to traverse.
 *   - outputPath: A relative or absolute path to write JSON output, with filename.
 *   - exifTags: An array of EXIF tags to extract.
 *   - validExtensions: An array of valid media extensions.
 *
 * @returns {Promise<Number|Object|Error>} A Promise that resolves to 0 if successful or an error object.
 *
 * @throws {Error} If there is an error extracting metadata.
 */
async function extractMetadata(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new Error('opts must be an object. Received:', opts)
  }
  const { __dirname, srcDir, exifTags, validExtensions } = mergeOptions(
    defaults,
    opts
  )

  try {
    const metadataList = await processDirectories(
      srcDir,
      __dirname,
      exifTags,
      validExtensions
    )
    console.log('Metadata extracted.')
    if (missingTags.length > 0) {
      console.error('Missing metadata:', missingTags)
    }
    await exiftool.end()
    return Promise.resolve(metadataList) // Return the metadataList;
  } catch (error) {
    console.error('Error extracting metadata:', error)
    await exiftool.end()
    throw error
  }
}

/**
 * Extract metadata from images in a directory and save it to a JSON file.
 *
 * @param {Options} opts - An options object containing the following properties:
 *   - __dirname: Absolute path to the relative project directory.
 *   - srcDir: Relative path of directory to traverse.
 *   - outputPath: A relative or absolute path to write JSON output, with filename.
 *   - exifTags: An array of EXIF tags to extract.
 *   - validExtensions: An array of valid media extensions.
 *
 * @returns {Promise<Object|Error>} A Promise that resolves to an object with the extracted metadata or an error object.
 */
async function extractMetadataToJsonFile(opts) {
  const { __dirname, srcDir, exifTags, validExtensions, outputPath } =
    mergeOptions(defaults, opts)
  try {
    const metadata = await extractMetadata(opts)
    const jsonOutput = JSON.stringify(metadata, null, 2)

    // Handle relative and absolute output paths.
    if (path.isAbsolute(outputPath)) {
      fs.writeFileSync(outputPath, jsonOutput)
    } else {
      fs.writeFileSync(path.resolve(__dirname, outputPath), jsonOutput)
    }
    console.log(
      'Metadata saved as JSON to:',
      path.resolve(__dirname, outputPath)
    )

    if (Object.keys(missingTags).length > 0) {
      try {
        const now = new Date()
        await writeToFile(
          'missing-tags.json',
          path.resolve(__dirname, outputPath),
          JSON.stringify(missingTags, null, 2),
          false,
          now.getTime() + '-'
        )
      } catch (error) {
        console.error('Error writing missing tags log:', error)
        throw error
      }
    }
    return Promise.resolve(metadata)
  } catch (error) {
    console.error('Error writing metadata to file:', error)
    throw error
  }
}

export { extractMetadata, extractMetadataToJsonFile }
