# Quickstart Validation Guide

**Feature**: 001-secure-backend-tests

This guide explains how to validate that the new secure backend tests are passing and functioning as designed.

## Prerequisites
- Node.js v20+
- `pnpm` installed globally
- Access to the `backend/` directory

## Setup

1. Navigate to the project root and install dependencies (if not already done):
   ```bash
   pnpm install
   ```

2. Navigate to the backend folder:
   ```bash
   cd backend
   ```

## Running the Tests

To validate the implementation, you must execute the Vitest test suite.

### 1. Run All Tests
Execute all tests to ensure the overall system is green:
```bash
pnpm run test
```
*Expected Outcome:* All tests pass. You should see `✓` for all test cases under `judger.test.ts` and `auth.test.ts`.

### 2. Verify Evaluation Isolation & Output Truncation
Run specifically the judger tests to verify security constraints:
```bash
npx vitest run test/unit/judger.test.ts
```
*Expected Outcome:* The test outputs should explicitly state that malicious payloads were blocked and infinite outputs were safely truncated without freezing the test runner.

### 3. Verify Anti-Cheat Rebinding
Run specifically the authentication/anti-cheat tests:
```bash
npx vitest run test/unit/auth.test.ts
```
*Expected Outcome:* Tests involving IP fallbacks and TA approval for device rebinding must pass, confirming that unauthorized logins are rejected.

### 4. Check Test Coverage (Optional but Recommended)
To verify that we have hit the 100% test coverage requirement for these modules:
```bash
npx vitest run --coverage
```
*Expected Outcome:* The coverage table in the terminal should show `100%` for Lines, Branches, Functions, and Statements within the targeted modules.
