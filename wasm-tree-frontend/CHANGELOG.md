# Changelog

## 0.3.0 - 2021-08-26

- WasmTree frontend is now developped in TypeScript

## 0.2.1 - 2021-03-11

- FIX: Remove the use of FinalizationRegistry as it was incorrect (some
applications could generate an error message due to it at the end of their
executions).
