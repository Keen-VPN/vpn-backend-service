# GitHub Actions Workflows

This directory contains automated CI/CD workflows for the KeenVPN Backend.

## Integration Tests Workflow

**File**: `integration-tests.yml`

### Triggers

- Push to `main` or `staging` branches
- Pull requests to `main` or `staging` branches

### What It Does

1. **Environment Setup**

   - Spins up PostgreSQL 15 service container
   - Sets up Node.js 18
   - Installs dependencies from package-lock.json

2. **Database Configuration**

   - Creates test environment variables
   - Generates Prisma client
   - Runs database migrations

3. **Test Execution**

   - Runs all integration tests
   - Generates coverage reports
   - Uploads results to Codecov

4. **PR Feedback**
   - Comments test results on pull requests
   - Shows coverage summary
   - Uploads test artifacts

### Required Secrets

No secrets required - all credentials are mocked for testing.

### Viewing Results

- Test results appear in the GitHub Actions tab
- Coverage reports are uploaded as artifacts
- PR comments show summary of results

### Local Testing

Before pushing, run tests locally:

```bash
npm run test:coverage
```

This ensures your changes pass CI before pushing.

### Troubleshooting

**Database connection errors:**

- Verify PostgreSQL service is healthy
- Check DATABASE_URL format

**Test failures:**

- Run tests locally first
- Check for environment-specific issues
- Review test logs in Actions tab

**Coverage below threshold:**

- Add tests for uncovered code
- Adjust thresholds in jest.config.ts if needed
