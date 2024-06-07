import { ExifTool } from 'exiftool-vendored'

// Passing desired flags for to the ExifTool instance isn't working atm
// See: https://github.com/photostructure/exiftool-vendored.js/issues/184

// https://exiftool.org/struct.html#:~:text=By%20default%2C%20tags%20are%20copied,is%20disabled%3B%20see%20below.)
// https://exiftool.org/ExifTool.html#Struct
// https://exiftool.org/struct.html

export const exifExtract = new ExifTool({
  struct: 0 // undefined | 0 | 1 | 2
})
