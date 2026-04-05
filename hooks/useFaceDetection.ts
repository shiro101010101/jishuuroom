'use client'
import { useEffect, useRef, useState, useCallback } from 'react'

export type FaceStatus = 'no_camera' | 'face_detected' | 'no_face' | 'checking'

export function useFaceDetection(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  enabled: boolean,
  onNoFace?: () => void,
  noFaceThresholdSec: number = 120
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const [faceStatus, setFaceStatus] = useState<FaceStatus>('no_camera')
  const noFaceSecondsRef = useRef(0)
  const [noFaceSeconds, setNoFaceSeconds] = useState(0)

  const detectFace = useCallback(() => {
    const video = videoRef.current
    if (!video || video.readyState < 2 || video.videoWidth === 0) {
      setFaceStatus('checking')
      return
    }

    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas')
    }
    const canvas = canvasRef.current
    const SIZE = 64
    canvas.width = SIZE
    canvas.height = SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.drawImage(video, 0, 0, SIZE, SIZE)
    const imageData = ctx.getImageData(0, 0, SIZE, SIZE)
    const data = imageData.data
    let skinPixels = 0

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2]
      const isSkin = (
        (r > 95 && g > 40 && b > 20 && r > g && r > b && Math.abs(r - g) > 15) ||
        (r > 80 && g > 50 && b > 30 && r > b && r > g * 0.8) ||
        (r > 60 && g > 35 && b > 20 && r > b * 1.1)
      )
      if (isSkin) skinPixels++
    }

    const skinRatio = skinPixels / (SIZE * SIZE)
    const faceDetected = skinRatio > 0.04

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
  }, [videoRef, onNoFace, noFaceThresholdSec])

  useEffect(() => {
    if (!enabled) {
      setFaceStatus('no_camera')
      noFaceSecondsRef.current = 0
      setNoFaceSeconds(0)
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }

    setFaceStatus('checking')
    noFaceSecondsRef.current = 0

    const startTimer = setTimeout(() => {
      intervalRef.current = setInterval(detectFace, 2000)
    }, 1000)

    return () => {
      clearTimeout(startTimer)
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [enabled, detectFace])

  return { faceStatus, noFaceSeconds }
}
