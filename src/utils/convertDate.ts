const getNum = (num: number): string =>
  `0${Math.floor(Math.abs(num))}`.slice(-2);

const toISOStringTimezoneOffset = (seconds: number): string => {
  const date = new Date(seconds * 1000);
  const offset = -date.getTimezoneOffset();
  const diff = offset >= 0 ? '+' : '-';
  return `${date.getFullYear()}-${getNum(date.getMonth() + 1)}-${getNum(
    date.getDate()
  )}T${getNum(date.getHours())}:${getNum(date.getMinutes())}:${getNum(
    date.getSeconds()
  )}${diff}${getNum(offset / 60)}:${getNum(offset % 60)}`;
};

export default toISOStringTimezoneOffset;
