// eslint-disable-next-line no-unused-vars
import * as typedefs from './typedefs.mjs'
import {
  mergeOptions,
  missingTags,
  validateOptions,
  writeToFile
} from './helpers.mjs'
import fs from 'fs'
import path from 'path'
import { processDirectories } from './logic.mjs'

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

  // Merge the provided options with the default options.
  const { dirName, srcDir, tagOptions, validExtensions } = mergeOptions(opts)

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
  // Throw if the provided options are not valid.
  const { dirName, outputPath } = mergeOptions(opts)

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
