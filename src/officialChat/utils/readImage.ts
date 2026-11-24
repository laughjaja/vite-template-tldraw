export function readImage(url: string): Promise<{ width: number; height: number }> {
	return new Promise((resolve, reject) => {
		const image = new Image()
		image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
		image.onerror = reject
		image.src = url
	})
}
