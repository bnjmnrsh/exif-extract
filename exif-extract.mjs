import fs from 'fs'
import path from 'path'
import { exiftool, ExifTool } from 'exiftool-vendored'
import { error, log } from 'console'
import * as typedefs from './typedefs.mjs'
import { defaults } from './default-options.mjs'
import {
  isObject,
  mergeObjects,
  validateOptions,
  writeToFile,
  writeTagToFile,
  logMissingTag,
  getFiles,
  missingTags
} from './helpers.mjs'

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
 * Filters the metadata object by gathering only the desired EXIF tags from an image's metadata.
 *
 * @param {string} absFilePath - The absolute path to the media file.
 * @param {string} dirName - The absolute path to the project directory.
 * @param {Array.<string|Object>} [tagOptions=[]] - The EXIF tags to filter.
 *
 * @returns {Promise<Object|Error>} - The filtered metadata object or an error.
 *
 * @throws {Error} - If there is an error reading the metadata.
 */
async function gatherTags(absFilePath, dirName, tagOptions = []) {
  try {
    console.log('Reading:', absFilePath)

    const metadata = await exiftool.read(absFilePath) // metadata object from media file
    let filteredMetadata = {}

    if (tagOptions.length) {
      for (const entry of tagOptions) {
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
    filteredMetadata.SourceFile = path.relative(dirName, absFilePath)
    filteredMetadata.Directory = path.relative(
      dirName,
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
 * Function to traverse each file in a directory and extract tag metadata.
 * Allows for parallel processing of images by mapping over files and collecting the promises, and using Promise.allSettled
 *
 *
 * @param {String} dir
 * @param {String} dirName - Absolute path to the project directory.
 * @param {Array.<typedefs.TagOpts>} tagOptions
 * @param {Array.<string>} allowedMediaFileExtensions
 *
 * @returns {Promise<Array>} Array of objects with EXIF metadata from each media file.
 */
async function processDirectories(
  dir,
  dirName,
  tagOptions,
  allowedMediaFileExtensions
) {
  const files = await getFiles(dir, allowedMediaFileExtensions)

  if (files.length === 0) {
    throw new Error(`No media files found in ${dir}`)
  }
  const metadataPromises = files.map(
    async (file) => await gatherTags(file, dirName, tagOptions)
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
 * Extract metadata from images in a directory and return it as an object.
 *
 * @param {typedefs.Options} opts - An options object containing the following properties:
 *   - dirName: The absolute path to the project directory.
 *   - srcDir: Relative path of directory to traverse.
 *   - outputPath: A relative or absolute path to write JSON output, with filename.
 *   - tagOptions: An array of EXIF tags to extract.
 *   - validExtensions: An array of valid media extensions.
 *
 * @returns {Promise<Number|Object|Error>} A Promise that resolves to 0 if successful or an error object.
 *
 * @throws {Error} If the provided options are not valid.
 * @throws {Error} If there is an error extracting metadata.
 */
async function extractMetadata(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new Error('opts must be an object. Received:', opts)
  }
  // Throw if the provided options are not valid.
  validateOptions(opts)

  const { dirName, srcDir, tagOptions, validExtensions } = mergeObjects(
    defaults,
    opts
  )

  try {
    const metadataList = await processDirectories(
      srcDir,
      dirName,
      tagOptions,
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
 * @param {typedefs.Options} opts - An options object containing the following properties:
 *   - dirName: The absolute path to the project directory.
 *   - srcDir: Relative path of directory to traverse.
 *   - outputPath: A relative or absolute path to write JSON output, with filename.
 *   - tagOptions: An array of EXIF tags to extract.
 *   - validExtensions: An array of valid media extensions.
 *
 * @returns {Promise<Object|Error>} A Promise that resolves to an object with the extracted metadata or an error object.
 */
async function extractMetadataToJsonFile(opts) {
  const { dirName, srcDir, tagOptions, validExtensions, outputPath } =
    mergeObjects(defaults, opts)
  try {
    const metadata = await extractMetadata(opts)
    const jsonOutput = JSON.stringify(metadata, null, 2)

    // Handle relative and absolute output paths.
    if (path.isAbsolute(outputPath)) {
      fs.writeFileSync(outputPath, jsonOutput)
    } else {
      fs.writeFileSync(path.resolve(dirName, outputPath), jsonOutput)
    }
    console.log('Metadata saved as JSON to:', path.resolve(dirName, outputPath))

    if (Object.keys(missingTags).length > 0) {
      try {
        const now = new Date()
        await writeToFile(
          'missing-tags.json',
          path.resolve(dirName, outputPath),
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
