// hooks/useFaceDetection.ts
'use client'
import { useEffect, useRef, useState, useCallback } from 'react'

export type FaceStatus = 'no_camera' | 'face_detected' | 'no_face' | 'checking'

export function useFaceDetection(
  stream: MediaStream | null,
  enabled: boolean,
  onNoFace?: () => void,
  noFaceThresholdSec: number = 30
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const noFaceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const [faceStatus, setFaceStatus] = useState<FaceStatus>('no_camera')
  const [noFaceSeconds, setNoFaceSeconds] = useState(0)

  const detectFace = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx || video.readyState < 2) return

    canvas.width = 80
    canvas.height = 80
    ctx.drawImage(video, 0, 0, 80, 80)

    // Simple skin-tone detection heuristic
    const imageData = ctx.getImageData(0, 0, 64, 64)
    const data = imageData.data
    let skinPixels = 0
    const totalPixels = 80 * 80

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2]
      // Improved skin tone detection for various ethnicities
      const isSkin = (
        // Light skin tones
        (r > 95 && g > 40 && b > 20 && r > g && r > b && Math.abs(r-g) > 15) ||
        // Medium skin tones
        (r > 80 && g > 50 && b > 30 && r > b && r > g * 0.8) ||
        // Darker skin tones  
        (r > 60 && g > 35 && b > 20 && r > b * 1.1 && r > g * 0.9)
      )
      if (isSkin) skinPixels++
    }

    const skinRatio = skinPixels / totalPixels
    // Lower threshold - easier to detect (5% instead of 8%)
    const faceDetected = skinRatio > 0.05

    if (faceDetected) {
      setFaceStatus('face_detected')
      setNoFaceSeconds(0)
      if (noFaceTimerRef.current) {
        clearTimeout(noFaceTimerRef.current)
        noFaceTimerRef.current = null
      }
    } else {
      setFaceStatus('no_face')
      setNoFaceSeconds(prev => {
        const next = prev + 3
        if (next >= noFaceThresholdSec && onNoFace) {
          onNoFace()
          return 0
        }
        return next
      })
    }
  }, [onNoFace])

  useEffect(() => {
    if (!stream || !enabled) {
      setFaceStatus('no_camera')
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }

    // Create hidden video element
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

    // Check every 3 seconds
    intervalRef.current = setInterval(detectFace, 2000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (noFaceTimerRef.current) clearTimeout(noFaceTimerRef.current)
      if (videoRef.current) {
        videoRef.current.srcObject = null
      }
    }
  }, [stream, enabled, detectFace])

  return { faceStatus, noFaceSeconds }
}
