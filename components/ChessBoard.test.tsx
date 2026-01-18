import { render, screen } from '@testing-library/react'

import ChessBoard from '@/components/ChessBoard'

describe('components/ChessBoard', () => {
  it('renders svg content when provided', () => {
    const svg = '<svg data-testid="embedded-svg"></svg>'
    render(<ChessBoard svg={svg} />)

    expect(screen.getByTestId('chessboard-svg')).toBeVisible()
    expect(screen.getByTestId('embedded-svg')).toBeVisible()
  })

  it('renders interactive board when svg is not provided', () => {
    render(<ChessBoard fen="start" size={320} />)

    expect(screen.getByTestId('chessboard-interactive')).toBeVisible()
  })
})
