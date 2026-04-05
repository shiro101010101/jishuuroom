'use client'
import { useEffect, useRef, useState, useCallback } from 'react'

export type FaceStatus = 'no_camera' | 'face_detected' | 'no_face' | 'checking'

export function useFaceDetection(
  stream: MediaStream | null,
  enabled: boolean,
  onNoFace?: () => void,
  noFaceThresholdSec: number = 120
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const [faceStatus, setFaceStatus] = useState<FaceStatus>('no_camera')
  const [noFaceSeconds, setNoFaceSeconds] = useState(0)
  const noFaceSecondsRef = useRef(0)

  const detectFace = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx || video.readyState < 2 || video.videoWidth === 0) return

    const SIZE = 64
    canvas.width = SIZE
    canvas.height = SIZE
    ctx.drawImage(video, 0, 0, SIZE, SIZE)

    const imageData = ctx.getImageData(0, 0, SIZE, SIZE)
    const data = imageData.data
    let skinPixels = 0
    const totalPixels = SIZE * SIZE

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2]
      // Multi-tone skin detection
      const isSkin = (
        (r > 95 && g > 40 && b > 20 && r > g && r > b && Math.abs(r - g) > 15) ||
        (r > 80 && g > 50 && b > 30 && r > b && r > g * 0.8) ||
        (r > 60 && g > 35 && b > 20 && r > b * 1.1)
      )
      if (isSkin) skinPixels++
    }

    const skinRatio = skinPixels / totalPixels
    const faceDetected = skinRatio > 0.04 // 4% threshold

    if (faceDetected) {
      setFaceStatus('face_detected')
      noFaceSecondsRef.current = 0
      setNoFaceSeconds(0)
    } else {
      setFaceStatus('no_face')
      noFaceSecondsRef.current += 2
      setNoFaceSeconds(noFaceSecondsRef.current)
      if (noFaceSecondsRef.current >= noFaceThresholdSec && onNoFace) {
        noFaceSecondsRef.current = 0
        setNoFaceSeconds(0)
        onNoFace()
      }
    }
  }, [onNoFace, noFaceThresholdSec])

  useEffect(() => {
    if (!stream || !enabled) {
      setFaceStatus('no_camera')
      setNoFaceSeconds(0)
      noFaceSecondsRef.current = 0
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }

    if (!videoRef.current) {
      videoRef.current = document.createElement('video')
      videoRef.current.muted = true
      videoRef.current.playsInline = true
    }
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas')
    }

    videoRef.current.srcObject = stream
    videoRef.current.play().catch(() => {})
    setFaceStatus('checking')
    noFaceSecondsRef.current = 0

    // Wait 2s for video to start then check every 2s
    const startTimer = setTimeout(() => {
      intervalRef.current = setInterval(detectFace, 2000)
    }, 2000)

    return () => {
      clearTimeout(startTimer)
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (videoRef.current) videoRef.current.srcObject = null
    }
  }, [stream, enabled, detectFace])

  return { faceStatus, noFaceSeconds }
}
