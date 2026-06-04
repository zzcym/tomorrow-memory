const db = require('better-sqlite3')('data.db');
const rows = db.prepare('SELECT u.phone, w.data FROM wordbooks w JOIN users u ON u.id = w.user_id').all();
console.log('Users with wordbooks: ' + rows.length);
rows.forEach(r => {
  try {
    const words = JSON.parse(r.data || '[]');
    const withReview = words.filter(w => w.lastReviewTime);
    console.log('Phone ' + r.phone.slice(-4) + ': ' + words.length + ' words, ' + withReview.length + ' with review');
    if (withReview.length > 0) {
      const latest = withReview.reduce((a,b) => a.lastReviewTime > b.lastReviewTime ? a : b);
      console.log('  Latest: ' + new Date(latest.lastReviewTime).toISOString() + ' word=' + latest.word);
    }
  } catch(e) { console.log('Error: ' + e.message); }
});
