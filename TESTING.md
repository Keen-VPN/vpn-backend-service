# KeenVPN Backend Testing Guide

This guide covers how to write, run, and maintain integration tests for the KeenVPN backend service.

## Table of Contents

- [Overview](#overview)
- [Setup](#setup)
- [Running Tests](#running-tests)
- [Writing Tests](#writing-tests)
- [Test Structure](#test-structure)
- [Mocking Strategy](#mocking-strategy)
- [Database Management](#database-management)
- [CI/CD Integration](#cicd-integration)
- [Troubleshooting](#troubleshooting)

## Overview

The KeenVPN backend uses **Jest** for integration testing with the following stack:

- **Jest**: Test framework with TypeScript support
- **Supertest**: HTTP endpoint testing
- **Prisma**: Database operations with test isolation
- **Jest Mock Extended**: Advanced mocking capabilities
- **Faker.js**: Realistic test data generation

### Test Coverage Goals

- **Routes**: All API endpoints tested
- **Models**: Database operations validated
- **External Services**: Properly mocked (Stripe, Firebase, Apple IAP)
- **Coverage Target**: >70% across lines, statements, functions, branches

## Setup

### 1. Install Dependencies

```bash
npm install
```

All test dependencies are already configured in `package.json`.

### 2. Setup Test Database

Create a separate test database to avoid conflicts with development data:

```bash
# Using Docker (recommended)
docker-compose up -d postgres

# Or use local PostgreSQL
createdb keenvpn_test
```

### 3. Configure Test Environment

Copy the test environment template:

```bash
cp .env.test.example .env.test
```

Edit `.env.test` with your test database credentials:

```env
NODE_ENV=test
DATABASE_URL="postgresql://keenvpn:keenvpn_dev_password@localhost:5432/keenvpn_test"
JWT_SECRET="test_jwt_secret_min_32_characters_long_for_testing"
# ... other test credentials
```

**Important**: Never use production credentials in test environment!

### 4. Run Migrations

Apply database migrations to your test database:

```bash
npx prisma migrate deploy
```

## Running Tests

### Run All Tests

```bash
npm test
```

This runs all integration tests sequentially (`--runInBand`) to avoid database conflicts.

### Run Integration Tests Only

```bash
npm run test:integration
```

### Run Tests in Watch Mode

```bash
npm run test:watch
```

Automatically re-runs tests when files change. Great for development!

### Generate Coverage Report

```bash
npm run test:coverage
```

Outputs coverage report to `coverage/` directory. Open `coverage/index.html` in a browser to view detailed coverage.

### Run Specific Test File

```bash
npm test -- tests/integration/auth.test.ts
```

### Run Specific Test Suite

```bash
npm test -- --testNamePattern="Auth Routes"
```

## Writing Tests

### Test File Structure

Create test files in `tests/integration/` with the naming pattern `*.test.ts`:

```typescript
import request from "supertest";
import { app } from "../../src/server.js";
import {
  setupTestDatabase,
  cleanupTestDatabase,
  teardownTestDatabase,
} from "../setup/test-db.js";
import { createTestUser } from "../setup/helpers.js";

describe("Feature Routes Integration Tests", () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await cleanupTestDatabase();
  });

  describe("POST /api/feature/endpoint", () => {
    it("should successfully process valid request", async () => {
      const user = await createTestUser();

      const response = await request(app).post("/api/feature/endpoint").send({
        userId: user.id,
        data: "test",
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it("should return 400 for invalid input", async () => {
      const response = await request(app)
        .post("/api/feature/endpoint")
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });
});
```

### Using Test Helpers

The `tests/setup/helpers.ts` file provides utility functions for creating test data:

```typescript
import {
  createTestUser,
  createTestSubscription,
  generateTestSessionToken,
} from "../setup/helpers.js";

// Create a test user
const user = await createTestUser({
  email: "test@example.com",
  provider: "google",
});

// Create a subscription
const subscription = await createTestSubscription({
  userId: user.id,
  status: "active",
});

// Generate session token
const sessionToken = generateTestSessionToken(
  user.id,
  user.email,
  user.provider
);
```

### Testing API Endpoints

Use `supertest` to make HTTP requests:

```typescript
// GET request
const response = await request(app).get("/api/endpoint");

// POST request with body
const response = await request(app)
  .post("/api/endpoint")
  .send({ data: "value" });

// With headers
const response = await request(app)
  .get("/api/endpoint")
  .set("Authorization", `Bearer ${token}`);

// With query parameters
const response = await request(app)
  .get("/api/endpoint")
  .query({ limit: 10, offset: 0 });
```

### Assertions

Use Jest's expect matchers:

```typescript
// Status codes
expect(response.status).toBe(200);

// Response body
expect(response.body.success).toBe(true);
expect(response.body.data).toBeDefined();
expect(response.body.error).toContain("Invalid");

// Arrays
expect(Array.isArray(response.body.data)).toBe(true);
expect(response.body.data.length).toBe(3);

// Objects
expect(response.body.user).toHaveProperty("id");
expect(response.body.user.email).toBe("test@example.com");
```

## Test Structure

### Directory Layout

```
tests/
├── setup/
│   ├── jest.setup.ts       # Global test configuration
│   ├── test-db.ts          # Database utilities
│   ├── mocks.ts            # External service mocks
│   └── helpers.ts          # Test data factories
└── integration/
    ├── auth.test.ts        # Auth route tests
    ├── subscription.test.ts # Subscription tests
    ├── connection.test.ts  # Connection session tests
    ├── desktop-auth.test.ts # Desktop auth tests
    └── apple-iap.test.ts   # Apple IAP tests
```

### Test Lifecycle

```typescript
describe("Test Suite", () => {
  beforeAll(async () => {
    // Runs once before all tests in this suite
    await setupTestDatabase();
  });

  afterAll(async () => {
    // Runs once after all tests in this suite
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    // Runs before each test
    await cleanupTestDatabase();
  });

  afterEach(() => {
    // Runs after each test
    jest.clearAllMocks();
  });

  it("test case", async () => {
    // Test implementation
  });
});
```

## Mocking Strategy

### External Services

All external services are mocked to ensure:

- Tests run fast
- No dependency on external APIs
- No API rate limits
- Predictable test results

### Firebase Admin SDK

Mocked in test files:

```typescript
jest.mock("firebase-admin", () => ({
  auth: jest.fn(() => ({
    verifyIdToken: jest.fn(async (token: string) => {
      if (token === "valid-token") {
        return { uid: "test-uid", email: "test@example.com" };
      }
      throw new Error("Invalid token");
    }),
  })),
}));
```

### Stripe API

Mocked in test files:

```typescript
jest.mock("../../src/config/stripe.js", () => ({
  default: {
    checkout: {
      sessions: {
        create: jest.fn(async () => ({
          id: "cs_test_123",
          url: "https://checkout.stripe.com/test",
        })),
      },
    },
  },
}));
```

### Apple IAP Verification

Mocked using `node-fetch`:

```typescript
jest.mock("node-fetch", () =>
  jest.fn((url: string, options?: any) => {
    if (url.includes("sandbox.itunes.apple.com")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ status: 0 /* ... */ }),
      });
    }
  })
);
```

## Database Management

### Test Database Isolation

Each test starts with a clean database:

```typescript
beforeEach(async () => {
  await cleanupTestDatabase(); // Deletes all test data
});
```

### Creating Test Data

Use helper functions instead of hardcoding:

```typescript
// Good
const user = await createTestUser();

// Bad
const user = await prisma.user.create({
  data: { email: "test@example.com" /* ... */ },
});
```

### Handling Transactions

Tests run sequentially (`--runInBand`) to avoid transaction conflicts.

## CI/CD Integration

### GitHub Actions

Tests run automatically on:

- Push to `main` or `develop` branches
- Pull requests to `main` or `develop`

The workflow:

1. Sets up PostgreSQL service container
2. Installs dependencies
3. Runs migrations
4. Executes integration tests
5. Generates coverage reports
6. Comments results on PRs

### Local CI Simulation

Test locally before pushing:

```bash
# Run all tests with coverage
npm run test:coverage

# Check for linting issues
npm run type-check
```

## Troubleshooting

### Database Connection Errors

**Problem**: `Can't reach database server`

**Solution**:

```bash
# Check if PostgreSQL is running
docker-compose ps

# Restart database
docker-compose restart postgres

# Verify connection string
echo $DATABASE_URL
```

### Test Timeouts

**Problem**: Tests exceed 30s timeout

**Solution**:

- Check for missing `await` keywords
- Verify database cleanup is working
- Increase timeout in specific test:

```typescript
it("long running test", async () => {
  // Test code
}, 60000); // 60 second timeout
```

### Mock Not Working

**Problem**: External service is called instead of mock

**Solution**:

- Ensure mock is defined before imports
- Use correct import path
- Clear mocks between tests:

```typescript
beforeEach(() => {
  jest.clearAllMocks();
});
```

### Prisma Client Errors

**Problem**: `PrismaClient is unable to be run in the browser`

**Solution**:

```bash
# Regenerate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate deploy
```

### Port Already in Use

**Problem**: `Port 3001 already in use`

**Solution**:

```bash
# Find process using the port
lsof -i :3001

# Kill the process
kill -9 <PID>

# Or change test port in .env.test
PORT=3002
```

### Coverage Below Threshold

**Problem**: `Coverage threshold not met`

**Solution**:

- Add tests for uncovered code
- Check coverage report: `coverage/index.html`
- Focus on critical paths first
- Adjust thresholds in `jest.config.ts` if needed

## Best Practices

### Do's

✅ **Use descriptive test names**

```typescript
it("should return 401 when session token is invalid");
```

✅ **Test both success and error cases**

```typescript
it("should create user with valid data");
it("should return 400 when email is missing");
```

✅ **Clean up between tests**

```typescript
beforeEach(async () => {
  await cleanupTestDatabase();
});
```

✅ **Use test helpers for common operations**

```typescript
const user = await createTestUser();
```

✅ **Mock external services**

```typescript
jest.mock("stripe", () => ({
  /* mock */
}));
```

### Don'ts

❌ **Don't use real API credentials**

```typescript
// Bad
STRIPE_SECRET_KEY = sk_live_real_key;
```

❌ **Don't skip cleanup**

```typescript
// Bad - leftover data affects other tests
it("test", async () => {
  await createTestUser();
  // No cleanup!
});
```

❌ **Don't use fixed IDs**

```typescript
// Bad
const userId = "user-123";

// Good
const user = await createTestUser();
const userId = user.id;
```

❌ **Don't test implementation details**

```typescript
// Bad - tests internal logic
expect(user.internalMethod()).toBe(true);

// Good - tests API behavior
expect(response.body.success).toBe(true);
```

## Additional Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [Prisma Testing Guide](https://www.prisma.io/docs/guides/testing)
- [TypeScript Jest Setup](https://jestjs.io/docs/getting-started#via-ts-jest)

---

**Questions or Issues?**

If you encounter problems not covered in this guide, please:

1. Check existing GitHub issues
2. Review test examples in `tests/integration/`
3. Ask in the team chat
4. Open a new issue with reproduction steps
