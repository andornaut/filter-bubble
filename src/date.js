const isToday = (dt) => {
  const today = new Date();
  return (
    dt.getDate() === today.getDate() && dt.getMonth() === today.getMonth() && dt.getFullYear() === today.getFullYear()
  );
};

const formatTime = (dt) => {
  let minutes = dt.getMinutes();
  let hours = dt.getHours();
  let suffix = 'am';
  if (hours > 12) {
    hours -= 12;
    suffix = 'pm';
  }
  if (hours === 0) {
    hours = '00';
  }
  if (minutes < 10) {
    minutes = `0${minutes}`;
  }
  return `${hours}:${minutes}${suffix}`;
};

export const humanDate = (dateStr) => {
  const dt = new Date(dateStr);
  return isToday(dt) ? formatTime(dt) : dt.toDateString();
};
