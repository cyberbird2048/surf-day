// 抓取 Open-Meteo 真实数据 → 裁剪 → 注入 index.html 作为离线快照
import fs from 'node:fs';

const FILE = process.argv[2];
const SPOTS = [
  [18.605,110.205],[18.293,109.762],[22.478,114.545],[22.718,115.570],[36.090,120.468],
  [18.420,110.050],[23.280,116.730],[22.565,114.885],[23.943,117.775],[29.870,122.900],[35.790,119.970],
  [-8.829,115.084],[-8.665,115.130],[9.799,126.166],[5.970,80.425],[35.372,140.390],
  [-28.162,153.550],[21.271,-157.822]
];
const lat = SPOTS.map(s=>s[0]).join(','), lon = SPOTS.map(s=>s[1]).join(',');
const mu = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&hourly=wave_height,swell_wave_height,swell_wave_period,swell_wave_direction,sea_surface_temperature,sea_level_height_msl&timezone=auto&forecast_days=7`;
const fu = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=wind_speed_10m,wind_direction_10m&daily=sunrise,sunset&timezone=auto&forecast_days=7`;

const [m, f] = await Promise.all([fetch(mu).then(r=>r.json()), fetch(fu).then(r=>r.json())]);
if (!Array.isArray(m) || !Array.isArray(f)) throw new Error('expected arrays: ' + JSON.stringify(m).slice(0,200));

const H = 72; // 快照保留 72 小时
const round = (v, d) => v == null ? null : +(+v).toFixed(d);
const trimLoc = (loc, hourlyKeys, dailyKeys, digits) => {
  const out = { utc_offset_seconds: loc.utc_offset_seconds, timezone: loc.timezone, hourly: {}, daily: {} };
  out.hourly.time = loc.hourly.time.slice(0, H);
  for (const k of hourlyKeys) out.hourly[k] = loc.hourly[k].slice(0, H).map(v => round(v, digits[k] ?? 1));
  if (loc.daily) { out.daily.time = loc.daily.time.slice(0, 3);
    for (const k of dailyKeys) out.daily[k] = loc.daily[k].slice(0, 3); }
  return out;
};
const mKeys = ['wave_height','swell_wave_height','swell_wave_period','swell_wave_direction','sea_surface_temperature','sea_level_height_msl'];
const fKeys = ['wind_speed_10m','wind_direction_10m'];
const digits = { swell_wave_direction:0, wind_direction_10m:0, wind_speed_10m:0, sea_surface_temperature:1 };

const snap = {
  at: Date.now(),
  m: m.map(l => trimLoc(l, mKeys, [], digits)),
  f: f.map(l => trimLoc(l, fKeys, ['sunrise','sunset'], digits)),
};

// 数据质量检查：每个点浪高非空比例
m.forEach((l, i) => {
  const nn = l.hourly.wave_height.filter(v => v != null).length;
  console.log(`spot${i} [${SPOTS[i]}] tz=${l.timezone} wave_height non-null ${nn}/${l.hourly.wave_height.length} sst=${l.hourly.sea_surface_temperature[12]} tide=${l.hourly.sea_level_height_msl[12]}`);
});

const json = JSON.stringify(snap);
console.log('snapshot bytes:', json.length);
let html = fs.readFileSync(FILE, 'utf8');
const marker = /<script id="snapshot">[\s\S]*?<\/script>/;
if (!marker.test(html)) throw new Error('snapshot marker not found');
html = html.replace(marker, `<script id="snapshot">window.__SNAPSHOT__=${json};</script>`);
fs.writeFileSync(FILE, html);
console.log('injected into', FILE);
