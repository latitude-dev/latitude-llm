import { Point } from './point'

export class Rectangle {
  private readonly _left: number
  private readonly _top: number
  private readonly _right: number
  private readonly _bottom: number

  constructor(left: number, top: number, right: number, bottom: number) {
    this._left = left
    this._top = top
    this._right = right
    this._bottom = bottom
  }

  get left(): number {
    return this._left
  }

  get top(): number {
    return this._top
  }

  get right(): number {
    return this._right
  }

  get bottom(): number {
    return this._bottom
  }

  get width(): number {
    return Math.abs(this._left - this._right)
  }

  get height(): number {
    return Math.abs(this._bottom - this._top)
  }

  public equals({ left, top, right, bottom }: Rectangle): boolean {
    return (
      this.left === left &&
      this.top === top &&
      this.right === right &&
      this.bottom === bottom
    )
  }

  public contains({ x, y }: Point): {
    result: boolean
    reason: {
      isOnBottomSide: boolean
      isOnLeftSide: boolean
      isOnRightSide: boolean
      isOnTopSide: boolean
    }
  } {
    const isOnTopSide = y < this.top
    const isOnBottomSide = y > this.bottom
    const isOnLeftSide = x < this.left
    const isOnRightSide = x > this.right

    const result =
      !isOnTopSide && !isOnBottomSide && !isOnLeftSide && !isOnRightSide

    return {
      reason: {
        isOnBottomSide,
        isOnLeftSide,
        isOnRightSide,
        isOnTopSide,
      },
      result,
    }
  }

  public intersectsWith(rect: Rectangle): boolean {
    const { left: x1, top: y1, width: w1, height: h1 } = rect
    const { left: x2, top: y2, width: w2, height: h2 } = this
    const maxX = x1 + w1 >= x2 + w2 ? x1 + w1 : x2 + w2
    const maxY = y1 + h1 >= y2 + h2 ? y1 + h1 : y2 + h2
    const minX = x1 <= x2 ? x1 : x2
    const minY = y1 <= y2 ? y1 : y2
    return maxX - minX < w1 + w2 && maxY - minY < h1 + h2
  }

  public generateNewRect({
    left = this.left,
    top = this.top,
    right = this.right,
    bottom = this.bottom,
  }): Rectangle {
    return new Rectangle(left, top, right, bottom)
  }

  static fromLTRB(
    left: number,
    top: number,
    right: number,
    bottom: number,
  ): Rectangle {
    return new Rectangle(left, top, right, bottom)
  }

  static fromLTWH(
    left: number,
    top: number,
    width: number,
    height: number,
  ): Rectangle {
    return new Rectangle(left, top, left + width, top + height)
  }

  static fromPoints(startPoint: Point, endPoint: Point): Rectangle {
    const { x: left, y: top } = startPoint
    const { x: right, y: bottom } = endPoint
    return Rectangle.fromLTRB(left, top, right, bottom)
  }

  static fromDOM(dom: HTMLElement): Rectangle {
    const { left, width, top, height } = dom.getBoundingClientRect()
    return Rectangle.fromLTWH(left, top, width, height)
  }
}
