const months = new Map([
  ['января', 0],
  ['февраля', 1],
  ['марта', 2],
  ['апреля', 3],
  ['мая', 4],
  ['июня', 5],
  ['июля', 6],
  ['августа', 7],
  ['сентября', 8],
  ['октября', 9],
  ['ноября', 10],
  ['декабря', 11],
]);

const getDate = (dateString: string): string | null => {
  let date: Date | null;
  const dateArr = dateString.split(' ');
  if (dateArr[0] === 'сегодня' || dateArr[0] === 'вчера') {
    date = new Date();
    if (dateArr[0] === 'вчера') date.setDate(date.getDate() - 1);
    const time = dateArr[2].split(':');
    date.setHours(+time[0], +time[1], 0, 0);
  } else {
    const now = new Date();
    const year = dateArr.length === 4 ? now.getFullYear() : +dateArr[2];
    const time = dateArr.slice(-1)[0].split(':');
    const month = months.get(dateArr[1]);
    if (month === undefined) date = null;
    else date = new Date(year, month, +dateArr[0], +time[0], +time[1]);
  }
  return date && date.toISOString();
};

export default getDate;
