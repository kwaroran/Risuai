export type ImageType = 'JPEG' | 'PNG' | 'GIF' | 'BMP' | 'AVIF' | 'WEBP' | 'Unknown'

export function getImageType(arr: Uint8Array): ImageType {
  switch (true) {
    case arr[0] === 0xff && arr[1] === 0xd8 && arr[arr.length - 2] === 0xff && arr[arr.length - 1] === 0xd9:
      return 'JPEG'
    case arr[0] === 0x89 &&
      arr[1] === 0x50 &&
      arr[2] === 0x4e &&
      arr[3] === 0x47 &&
      arr[4] === 0x0d &&
      arr[5] === 0x0a &&
      arr[6] === 0x1a &&
      arr[7] === 0x0a:
      return 'PNG'
    case arr[0] === 0x47 &&
      arr[1] === 0x49 &&
      arr[2] === 0x46 &&
      arr[3] === 0x38 &&
      (arr[4] === 0x37 || arr[4] === 0x39) &&
      arr[5] === 0x61:
      return 'GIF'
    case arr[0] === 0x42 && arr[1] === 0x4d:
      return 'BMP'
    case arr[4] === 0x66 &&
      arr[5] === 0x74 &&
      arr[6] === 0x79 &&
      arr[7] === 0x70 &&
      arr[8] === 0x61 &&
      arr[9] === 0x76 &&
      arr[10] === 0x69 &&
      arr[11] === 0x66:
      return 'AVIF'
    case arr[0] === 0x52 &&
      arr[1] === 0x49 &&
      arr[2] === 0x46 &&
      arr[3] === 0x46 &&
      arr[8] === 0x57 &&
      arr[9] === 0x45 &&
      arr[10] === 0x42 &&
      arr[11] === 0x50:
      return 'WEBP'
  }

  return 'Unknown'
}
