'use client'
import { useEffect, useRef, useState, useCallback } from 'react'

export type FaceStatus = 'no_camera' | 'face_detected' | 'no_face' | 'checking' | 'loading'

export function useFaceDetection(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  enabled: boolean,
  onNoFace?: () => void,
  noFaceThresholdSec: number = 120
) {
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const detectorRef = useRef<any>(null)
  const [faceStatus, setFaceStatus] = useState<FaceStatus>('no_camera')
  const noFaceSecondsRef = useRef(0)
  const [noFaceSeconds, setNoFaceSeconds] = useState(0)
  const loadingRef = useRef(false)

  const loadDetector = useCallback(async () => {
    if (detectorRef.current || loadingRef.current) return
    loadingRef.current = true
    setFaceStatus('loading')
    try {
      // Load TensorFlow.js and BlazeFace from CDN
      if (!(window as any).tf) {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement('script')
          s.src = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.10.0/dist/tf.min.js'
          s.onload = () => resolve()
          s.onerror = reject
          document.head.appendChild(s)
        })
      }
      if (!(window as any).blazeface) {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement('script')
          s.src = 'https://cdn.jsdelivr.net/npm/@tensorflow-models/blazeface@0.0.7/dist/blazeface.min.js'
          s.onload = () => resolve()
          s.onerror = reject
          document.head.appendChild(s)
        })
      }
      // Wait for tf to be ready
      await (window as any).tf.ready()
      detectorRef.current = await (window as any).blazeface.load()
      setFaceStatus('checking')
      console.log('✓ BlazeFace loaded')
    } catch(e) {
      console.error('Failed to load face detector:', e)
      setFaceStatus('no_camera')
    }
    loadingRef.current = false
  }, [])

  const detectFace = useCallback(async () => {
    const video = videoRef.current
    if (!video || video.readyState < 2 || video.videoWidth === 0) return
    if (!detectorRef.current) return

    try {
      const predictions = await detectorRef.current.estimateFaces(video, false)
      const faceDetected = predictions && predictions.length > 0

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
    } catch(e) {
      console.error('Face detection error:', e)
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

    loadDetector().then(() => {
      if (!detectorRef.current) return
      noFaceSecondsRef.current = 0
      setFaceStatus('checking')
      setTimeout(() => {
        intervalRef.current = setInterval(detectFace, 2000)
      }, 2000)
    })

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [enabled, loadDetector, detectFace])

  return { faceStatus, noFaceSeconds }
}
