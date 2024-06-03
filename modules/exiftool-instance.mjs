import { ExifTool } from 'exiftool-vendored'

// https://exiftool.org/struct.html#:~:text=By%20default%2C%20tags%20are%20copied,is%20disabled%3B%20see%20below.)
// https://exiftool.org/ExifTool.html#Struct
// https://exiftool.org/struct.html

export const exifExtract = new ExifTool({
  exiftoolArgs: ['-stay_open', 'True', '-@', '-', '-taco'] //, '-api', 'struct=2'
})
