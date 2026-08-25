# Data Model / Entities

*Note: This feature focuses entirely on backend test coverage. No new database tables or persistent entities are introduced. However, we define the following mock shapes used exclusively during testing.*

## Mock Entities for Testing

### `MockPayload`
Represents a student's code submission specifically tailored for extreme or malicious testing.
- `code` (string): The actual code to run (e.g., an infinite loop, or a script trying to read `/etc/passwd`).
- `language` (string): The execution environment.
- `expectedStatus` (enum): Expected outcome (e.g., `TLE` for infinite loops, `RE` for permission denied).

### `MockSession`
Represents an active socket or login session to test IP rebinding logic.
- `userId` (string): The mock student's ID.
- `deviceId` (string): The mocked device fingerprint.
- `ipAddress` (string): The connection IP.
- `taApprovalStatus` (boolean): Whether a TA has approved the session (used in fallback/rebinding tests).

## Validation Rules Tested
- **Evaluation Isolation:** The sandbox MUST NOT have read/write access outside its temporary designated folder.
- **Output Truncation:** stdout/stderr length `> MAX_LIMIT` MUST be truncated to exactly `MAX_LIMIT`.
- **IP Rebinding:** A login with `(userId, newDevice, newIp)` when an active session exists MUST require `taApprovalStatus = true`.
