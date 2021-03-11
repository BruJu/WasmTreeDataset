# Changelog


## 0.2.1 - 2020-03-11

- FIX: Remove the use of FinalizationRegistry as it was incorrect (some
applications could generate an error message due to it at the end of their
executions).
