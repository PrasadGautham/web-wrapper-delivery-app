export function resolveLoginCredentials(nodes) {
  const candidates = [
    { email: nodes.gateEmail, password: nodes.gatePassword },
    { email: nodes.email, password: nodes.password },
  ];

  for (const candidate of candidates) {
    const email = candidate.email?.value?.trim() || '';
    const password = candidate.password?.value || '';
    if (email || password) {
      return { email, password };
    }
  }

  return { email: '', password: '' };
}
