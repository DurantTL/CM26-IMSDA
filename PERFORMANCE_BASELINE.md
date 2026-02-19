# Performance Baseline Analysis

## Current Inefficiencies
The following functions use multiple individual `setValue` calls, which is a known performance bottleneck in Google Apps Script due to the network overhead of each call.

### 1. Operations.gs
- **checkInRegistration**: Up to 6 `setValue` calls per execution.
- **checkOutRegistration**: 4 `setValue` calls per execution.

### 2. CheckIn.gs
- **processCheckIn**: Up to 10 `setValue` calls per execution.
- **processCheckOut**: Up to 7 `setValue` calls per execution.

### 3. Admin.gs
- **recalculateAllTotals**: 4 `setValue` calls *per registration row*. For a sheet with 100 registrations, this results in 400 API calls.

## Expected Improvements
By batching these calls using `setValues`, we expect:
- **Operations.gs & CheckIn.gs**: Reduction from ~4-10 calls to 2 calls per function execution.
- **Admin.gs**: Reduction from 4*N calls to 4 calls *total* for the entire function.

## Rationale for Measurements
Real-time benchmarking (measuring execution time) is impractical in this sandbox environment as it lacks the Google Apps Script `SpreadsheetApp` service and connection to a real Google Sheet. However, reducing the number of service calls is the primary recommendation for optimizing Apps Script performance, as documented in Google's official best practices.
