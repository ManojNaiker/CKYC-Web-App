import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseClientRegisterFilters,
  serializeClientRegisterFilters,
  updateClientRegisterFilters,
} from './client-register-filters';

describe('client register URL filters', () => {
  it('restores a valid shared view and serializes it canonically', () => {
    const filters = parseClientRegisterFilters(
      'search=Anita+Shah&status=matched&page=3',
    );

    assert.deepEqual(filters, {
      search: 'Anita Shah',
      status: 'matched',
      page: 3,
    });
    assert.equal(
      serializeClientRegisterFilters(filters),
      'search=Anita+Shah&status=matched&page=3',
    );
  });

  it('resets to the first page when search changes', () => {
    const filters = updateClientRegisterFilters(
      parseClientRegisterFilters('search=old&status=matched&page=4'),
      { search: 'new' },
    );

    assert.deepEqual(filters, {
      search: 'new',
      status: 'matched',
      page: 1,
    });
    assert.equal(
      serializeClientRegisterFilters(filters),
      'search=new&status=matched',
    );
  });

  it('resets to the first page when status changes', () => {
    const filters = updateClientRegisterFilters(
      parseClientRegisterFilters('search=Anita&page=4'),
      { status: 'error' },
    );

    assert.deepEqual(filters, {
      search: 'Anita',
      status: 'error',
      page: 1,
    });
    assert.equal(
      serializeClientRegisterFilters(filters),
      'search=Anita&status=error',
    );
  });

  it('falls back to the default status and page for unsupported URL values', () => {
    assert.deepEqual(
      parseClientRegisterFilters(
        'search=Anita&status=unsupported&page=not-a-number',
      ),
      {
        search: 'Anita',
        status: '',
        page: 1,
      },
    );
  });
});