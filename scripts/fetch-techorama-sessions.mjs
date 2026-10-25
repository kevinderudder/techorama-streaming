#!/usr/bin/env node
// Fetches the Techorama schedule (title, room, time, track, speakers + photo) from techorama.nl
// and writes src/data/techorama-sessions.json, which src/sessions.html shows on the screens.
//
// Usage:  node scripts/fetch-techorama-sessions.mjs [tuesday wednesday …]
// Run it again (and commit the JSON) whenever the schedule on the website changes.

import { writeFile, mkdir } from 'node:fs/promises';

const BASE = 'https://techorama.nl';
const days = process.argv.slice(2).length ? process.argv.slice(2) : ['tuesday', 'wednesday'];
const out = new URL('../src/data/techorama-sessions.json', import.meta.url);
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

const decode = s => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const text = s => decode(String(s || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
const first = (html, re) => { const m = html.match(re); return m ? m[1] : ''; };

async function get(path) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(BASE + path, { headers: { 'user-agent': 'techorama-signage (schedule screens)' } });
    if (res.ok) return res.text();
    if (attempt === 3) throw new Error(`${path}: HTTP ${res.status}`);
    await new Promise(r => setTimeout(r, 1000 * attempt));
  }
}

// A few pages at a time, to be gentle on the website
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (next < items.length) { const i = next++; results[i] = await fn(items[i], i); }
  }));
  return results;
}

// The day page: time slots with session cards (links to the detail page) and static cards (break, lunch …)
function parseDay(html) {
  const year = first(html, /\d{1,2}\s*-\s*\d{1,2}\s+[A-Z]{3}\s+(\d{4})/i);
  const slots = html.split('<div class="agenda-slot">').slice(1);
  const cards = [];
  for (const slot of slots) {
    const [, from, until] = text(first(slot, /agenda-slot__time">([\s\S]*?)<\/div>/)).match(/(\d{1,2}:\d{2})\D+(\d{1,2}:\d{2})/) || [];
    if (!from) continue;
    for (const card of slot.split(/(?=<(?:a|div) class="session-card[" ])/).slice(1)) {
      cards.push({
        href: first(card, /^<a class="session-card[^"]*" href="([^"]+)"/),
        start: from.padStart(5, '0'), end: until.padStart(5, '0'),
        room: text(first(card, /session-card__time">([\s\S]*?)<\/div>/)),
        title: text(first(card, /session-card__title">([\s\S]*?)<\/div>/)),
        speakerText: text(first(card, /session-card__meta--secondary">([\s\S]*?)<\/div>/)),
        track: text(first(card, /class="session-track [^"]*">([\s\S]*?)<\/span>/)),
        level: text(first(card, /class="session-level [^"]*">([\s\S]*?)<\/span>/))
      });
    }
  }
  return { year, cards };
}

// The session page: speakers with photo, and the date ("Tue 27 Oct • 08:30–09:30")
function parseSession(html) {
  const speakers = [...html.matchAll(/<a class="session-detail__speaker"[\s\S]*?<img src="([^"]+)" alt="([^"]*)"/g)]
    .map(m => ({ name: decode(m[2]).trim(), photo: m[1] }));
  const [, d, mon] = text(html).match(/\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\w*\s+(\d{1,2})\s+([A-Za-z]{3})\w*\s+•/) || [];
  return { speakers, date: d ? { day: +d, month: MONTHS[mon.toLowerCase()] } : null };
}

const sessions = [];
for (const day of days) {
  const { year, cards } = parseDay(await get('/schedule/' + day));
  const talks = cards.filter(c => c.href);
  console.log(`${day}: ${talks.length} sessions, ${cards.length - talks.length} other items — fetching speakers…`);
  const details = await mapLimit(talks, 4, c => get(c.href).then(parseSession));
  const date = details.map(d => d.date).find(Boolean);
  if (!date || !year) throw new Error(`${day}: could not find the date`);
  const iso = `${year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
  let t = 0;
  for (const c of cards) {
    const detail = c.href ? details[t++] : null;
    sessions.push({
      id: c.href ? c.href.split('/').pop() : `${iso}-${c.start}-${c.title}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      kind: c.href ? 'session' : 'break',
      date: iso, start: c.start, end: c.end,
      room: c.room, title: c.title, track: c.track || null, level: c.level || null,
      speakers: detail && detail.speakers.length ? detail.speakers
        : c.speakerText ? c.speakerText.split(/\s*,\s*|\s+&\s+/).map(name => ({ name, photo: null })) : [],
      url: c.href ? BASE + c.href : null
    });
  }
}

sessions.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start) || a.room.localeCompare(b.room));
await mkdir(new URL('.', out), { recursive: true });
await writeFile(out, JSON.stringify({ source: BASE + '/schedule', fetchedAt: new Date().toISOString(), sessions }, null, 1) + '\n');
const noPhoto = sessions.filter(s => s.kind === 'session' && !s.speakers.some(p => p.photo));
console.log(`Wrote ${sessions.length} items to ${out.pathname}` + (noPhoto.length ? ` (${noPhoto.length} without a speaker photo)` : ''));
