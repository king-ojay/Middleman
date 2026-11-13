// "Amina Uwimana" -> "Amina U." for lists other people see (NFR-05).
export const shortName = name => {
  const [first, ...rest] = String(name || '').trim().split(/\s+/);
  return rest.length ? `${first} ${rest[rest.length - 1][0]}.` : first;
};
