export function compareUnicodeScalars(leftValue, rightValue) {
  const left = String(leftValue)[Symbol.iterator]()
  const right = String(rightValue)[Symbol.iterator]()

  while (true) {
    const leftEntry = left.next()
    const rightEntry = right.next()
    if (leftEntry.done || rightEntry.done) {
      if (leftEntry.done && rightEntry.done) return 0
      return leftEntry.done ? -1 : 1
    }

    const leftCodePoint = leftEntry.value.codePointAt(0)
    const rightCodePoint = rightEntry.value.codePointAt(0)
    if (leftCodePoint !== rightCodePoint) {
      return leftCodePoint < rightCodePoint ? -1 : 1
    }
  }
}
