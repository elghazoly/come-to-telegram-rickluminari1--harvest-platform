const WORKER_URL = process.env.NEXT_PUBLIC_CF_WORKER_URL!
const WORKER_TOKEN = process.env.CF_WORKER_TOKEN!

export async function uploadVideo(file: File, path: string): Promise<string> {
  const res = await fetch(`${WORKER_URL}/${path}`, {
    method: 'PUT',
    headers: {
      'X-Auth-Token': WORKER_TOKEN,
      'Content-Type': file.type || 'video/mp4',
    },
    body: file,
  })
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
  const data = await res.json()
  return data.url as string
}

export async function deleteVideo(path: string): Promise<void> {
  await fetch(`${WORKER_URL}/${path}`, {
    method: 'DELETE',
    headers: { 'X-Auth-Token': WORKER_TOKEN },
  })
}

export function getVideoUrl(path: string): string {
  return `${WORKER_URL}/${path}`
}
