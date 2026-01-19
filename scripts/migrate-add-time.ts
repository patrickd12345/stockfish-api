import { getSql, connectToDb } from '../lib/database';
import { Chess } from 'chess.js';

async function migrate() {
  await connectToDb();
  const sql = getSql();

  console.log('Adding time column to games table...');
  try {
    await sql`ALTER TABLE games ADD COLUMN IF NOT EXISTS time TEXT`;
    console.log('Column added successfully.');
  } catch (error) {
    console.error('Error adding column:', error);
  }

  console.log('Backfilling time column from PGN headers...');
  const games = await sql`SELECT id, pgn_text FROM games WHERE time IS NULL`;
  console.log(`Found ${games.length} games to backfill.`);

  for (const game of games) {
    try {
      const chess = new Chess();
      chess.loadPgn(game.pgn_text);
      const headers = chess.header();
      const time = headers.UTCTime || headers.Time || null;
      
      if (time) {
        await sql`UPDATE games SET time = ${time} WHERE id = ${game.id}`;
      }
    } catch (error) {
      console.error(`Error processing game ${game.id}:`, error);
    }
  }

  console.log('Backfill completed.');
  process.exit(0);
}

migrate().catch(err => {
  console.error(err);
  process.exit(1);
});
