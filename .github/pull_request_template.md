# PR Checklist

- Required Checks
    - [ ] Have you added type definitions?
    - [ ] Have you tested your changes?
    - [ ] Have you checked that it won't break any existing features?
- [ ] If your PR uses models[^1], if true, check the following:
    - [ ] Have you checked if it works normally in all models?
    - [ ] Have you checked if it works normally in all web, local, and node hosted versions? If it doesn't, have you blocked it in those versions?
- [ ] If your PR is highly ai generated[^2], check the following:
    - [ ] Have you understanded what the code does?
    - [ ] Have you cleaned up any unnecessary or redundant code?
    - [ ] Is is not a huge change?
       - We currently do not accept highly ai generated PRs that are large changes.


[^1]: Modifies the behavior of prompting, requesting or handling responses from ai models.
[^2]: Almost over 80% of the code is ai generated.

# Description
