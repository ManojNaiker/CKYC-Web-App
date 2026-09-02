export const CLIENT_STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'matched', label: 'ID received' },
  { value: 'error', label: 'No ID / error' },
  { value: 'awaiting', label: 'Awaiting response' },
] as const;

export type ClientStatusFilter = (typeof CLIENT_STATUS_OPTIONS)[number]['value'];

export type ClientRegisterFilters = {
  search: string;
  status: ClientStatusFilter;
  page: number;
};

export const DEFAULT_CLIENT_REGISTER_FILTERS: ClientRegisterFilters = {
  search: '',
  status: '',
  page: 1,
};

export function parseClientRegisterFilters(query: string): ClientRegisterFilters {
  const params = new URLSearchParams(query);
  const requestedStatus = params.get('status') ?? '';
  const status = CLIENT_STATUS_OPTIONS.some((option) => option.value === requestedStatus)
    ? (requestedStatus as ClientStatusFilter)
    : DEFAULT_CLIENT_REGISTER_FILTERS.status;
  const requestedPage = params.get('page');
  const parsedPage = requestedPage ? Number(requestedPage) : NaN;
  const page = Number.isSafeInteger(parsedPage) && parsedPage > 0
    ? parsedPage
    : DEFAULT_CLIENT_REGISTER_FILTERS.page;

  return {
    search: params.get('search') ?? DEFAULT_CLIENT_REGISTER_FILTERS.search,
    status,
    page,
  };
}

export function serializeClientRegisterFilters(filters: ClientRegisterFilters): string {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  if (filters.status) params.set('status', filters.status);
  if (filters.page > 1) params.set('page', String(filters.page));
  return params.toString();
}

export function updateClientRegisterFilters(
  filters: ClientRegisterFilters,
  updates: Partial<ClientRegisterFilters>,
): ClientRegisterFilters {
  const shouldResetPage = updates.search !== undefined || updates.status !== undefined;

  return {
    ...filters,
    ...updates,
    ...(shouldResetPage ? { page: DEFAULT_CLIENT_REGISTER_FILTERS.page } : {}),
  };
}