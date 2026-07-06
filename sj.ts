import { calculatePrayerTimes, formatPrayerTime } from './lib/prayer/calculate';

const times = calculatePrayerTimes({
  latitude: 37.37707183790829,        // your city's latitude
  longitude: -121.95905954658049,       // your city's longitude
  timeZone: 'America/Los_Angeles', // IANA name, e.g. 'America/Chicago'
  method: 'NorthAmerica', // or whichever method your mosque uses
  madhab: 'hanafi',        // or 'hanafi'
});

for (const p of ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'] as const) {
  console.log(p, formatPrayerTime(times[p], 'America/Los_Angeles'));
}