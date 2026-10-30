/** Solar-event estimates from standard solar declination / equation-of-time astronomy.
 * Inputs: a Philippine city-center coordinate and a date in Asia/Manila time.
 * Outputs: approximate sunrise, sunset and daylight in local minutes, no API or GPS.
 */
const RAD = Math.PI / 180;
const PH_ZONE = 'Asia/Manila';
const PH_OFFSET_MINUTES = 8 * 60;

export const CITY_OPTIONS = [
  ['butuan','Butuan City'],['cagayan_de_oro','Cagayan de Oro'],['surigao','Surigao City'],
  ['iligan','Iligan City'],['davao','Davao City'],['cebu','Cebu City'],
  ['manila','Metro Manila'],['iloilo','Iloilo City'],['bacolod','Bacolod City'],
  ['baguio','Baguio City'],['zamboanga','Zamboanga City'],['general_santos','General Santos'],
  ['tacloban','Tacloban City'],['dumaguete','Dumaguete City']
];

export function manilaClock(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PH_ZONE, year: 'numeric', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(x => [x.type, Number(x.value)]));
  return {year: values.year, month: values.month, day: values.day,
    minutes: values.hour * 60 + values.minute};
}

function solarTerms(dayOfYear, year) {
  const leap = new Date(Date.UTC(year, 1, 29)).getUTCDate() === 29;
  const gamma = 2 * Math.PI / (leap ? 366 : 365) * (dayOfYear - 1);
  const equationOfTime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma)
    - 0.032077 * Math.sin(gamma) - 0.014615 * Math.cos(2 * gamma)
    - 0.040849 * Math.sin(2 * gamma));
  const declination = 0.006918 - 0.399912 * Math.cos(gamma)
    + 0.070257 * Math.sin(gamma) - 0.006758 * Math.cos(2 * gamma)
    + 0.000907 * Math.sin(2 * gamma) - 0.002697 * Math.cos(3 * gamma)
    + 0.00148 * Math.sin(3 * gamma);
  return {equationOfTime, declination};
}

export function getSunHours(date, lat, lng) {
  const {year, month, day} = manilaClock(date);
  if (![lat,lng].every(Number.isFinite) || Math.abs(lat)>90 || Math.abs(lng)>180) return null;
  const dayOfYear = Math.round((Date.UTC(year, month-1, day) - Date.UTC(year,0,1))/86400000)+1;
  const {equationOfTime,declination} = solarTerms(dayOfYear, year);
  const cosHourAngle = (Math.cos(90.833 * RAD) / (Math.cos(lat*RAD)*Math.cos(declination)))
    - Math.tan(lat*RAD)*Math.tan(declination);
  if (!Number.isFinite(cosHourAngle) || Math.abs(cosHourAngle)>1) return null;
  const hourAngle = Math.acos(Math.max(-1,Math.min(1,cosHourAngle))) / RAD;
  const noon = 720 - 4 * lng - equationOfTime + PH_OFFSET_MINUTES;
  const rise = noon - 4 * hourAngle;
  const set = noon + 4 * hourAngle;
  return {sunrise: rise, sunset: set, daylight: set - rise};
}

export function formatSunTime(minutes) {
  if (!Number.isFinite(minutes)) return '—';
  const t = ((Math.round(minutes) % 1440)+1440) % 1440;
  const h = Math.floor(t / 60), m = t % 60;
  return `${h%12||12}:${String(m).padStart(2,'0')} ${h<12?'AM':'PM'}`;
}

export function formatDaylight(minutes) {
  if (!Number.isFinite(minutes)) return '—';
  const rounded = Math.round(minutes);
  return `${Math.floor(rounded / 60)}h ${String(rounded%60).padStart(2,'0')}m`;
}
