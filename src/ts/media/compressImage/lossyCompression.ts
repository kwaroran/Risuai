export async function doLossyCompression(imageData: Uint8Array): Promise<Buffer> {
    return new Promise((resolve) => {
        const base64Image = 'data:image/png;base64,' + Buffer.from(imageData).toString('base64')
        const image = new Image()
        image.onload = () => {
            const canvas = document.createElement('canvas')
            const context = canvas.getContext('2d')
            if (!context) {
                throw new Error('Unable to get 2D context')
            }

            // Compute the new dimensions while maintaining aspect ratio
            let { width, height } = image
            if (width > 3000 || height > 3000) {
                const aspectRatio = width / height
                if (width > height) {
                    width = 3000
                    height = Math.round(width / aspectRatio)
                } else {
                    height = 3000
                    width = Math.round(height * aspectRatio)
                }
            }

            // Resize and draw the image to the canvas
            canvas.width = width
            canvas.height = height
            context.drawImage(image, 0, 0, width, height)

            // Try to convert to WebP
            let base64 = canvas.toDataURL('image/webp', 75)

            // If WebP is not supported, convert to JPEG
            if (base64.indexOf('data:image/webp') != 0) {
                base64 = canvas.toDataURL('image/jpeg', 75)
            }

            const array = Buffer.from(base64.split(',')[1], 'base64')
            resolve(array)
        }
        image.src = base64Image
    })
}
