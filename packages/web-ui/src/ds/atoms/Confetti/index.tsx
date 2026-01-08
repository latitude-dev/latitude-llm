'use client'

import { useEffect, useState, type CSSProperties } from 'react'

const DEFAULT_COLORS = [
  '#FF6B6B',
  '#4ECDC4',
  '#45B7D1',
  '#96CEB4',
  '#FFEAA7',
  '#DDA0DD',
  '#98D8C8',
  '#F7DC6F',
  '#BB8FCE',
  '#85C1E9',
]

type Shape = 'rectangle' | 'square' | 'circle'

type ConfettiPiece = {
  id: number
  left: number
  delay: number
  duration: number
  color: string
  size: number
  shape: Shape
  drift: number
  rotation: number
}

type Props = {
  /** Number of confetti pieces to render */
  count?: number
  /** Custom colors for confetti pieces */
  colors?: string[]
}

/**
 * Confetti celebration effect that falls from the top of the screen.
 * Renders colorful shapes (rectangles, squares, circles) that drift and rotate as they fall.
 */
export function Confetti({ count = 100, colors = DEFAULT_COLORS }: Props) {
  const [pieces, setPieces] = useState<ConfettiPiece[]>([])

  useEffect(() => {
    const shapes: Shape[] = ['rectangle', 'square', 'circle']
    const confettiPieces: ConfettiPiece[] = Array.from(
      { length: count },
      (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 1.5,
        duration: 3 + Math.random() * 3,
        color: colors[Math.floor(Math.random() * colors.length)]!,
        size: 8 + Math.random() * 8,
        shape: shapes[Math.floor(Math.random() * shapes.length)]!,
        drift: (Math.random() - 0.5) * 200,
        rotation: 360 + Math.random() * 720,
      }),
    )
    setPieces(confettiPieces)
  }, [count, colors])

  const getShapeStyles = (piece: ConfettiPiece): CSSProperties => {
    const base: CSSProperties = {
      backgroundColor: piece.color,
      width: piece.size,
    }

    switch (piece.shape) {
      case 'circle':
        return { ...base, height: piece.size, borderRadius: '50%' }
      case 'square':
        return { ...base, height: piece.size, borderRadius: '2px' }
      case 'rectangle':
      default:
        return { ...base, height: piece.size * 0.4, borderRadius: '2px' }
    }
  }

  return (
    <div className='fixed inset-x-0 top-0 h-screen pointer-events-none overflow-hidden z-50'>
      {pieces.map((piece) => (
        <div
          key={piece.id}
          className='absolute'
          style={{
            left: `${piece.left}%`,
            top: '-20px',
            ...getShapeStyles(piece),
            animation: `confetti-fall ${piece.duration}s ease-out ${piece.delay}s forwards`,
            ['--drift' as string]: `${piece.drift}px`,
            ['--rotation' as string]: `${piece.rotation}deg`,
          }}
        />
      ))}
      <style jsx>{`
        @keyframes confetti-fall {
          0% {
            transform: translateY(0) translateX(0) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) translateX(var(--drift))
              rotate(var(--rotation));
            opacity: 0;
          }
        }
      `}</style>
    </div>
  )
}

