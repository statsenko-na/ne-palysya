# Готовые сообщения для четырёх диалогов

Создать четыре диалога в этом проекте, выбрать нужную модель и вставить каждому его блок целиком.
Пути уже заполнены. Диалог создаёт свой worktree, а не пишет в общей папке.
Рабочие prompts на английском согласно AGENTS.md; ответы пользователю остаются на русском.

## Диалог A

```text
Work on the office game in a dedicated managed worktree. Do not edit the shared source checkout.
Your lane is A. Read the current instructions from:
C:/Users/Nikolai S/Documents/ClaudeGames/ne-palysya/docs/plans/office-stories/parallel/LANE-A.md
Also read PROTOCOL.md and API.md in that directory, repository AGENTS.md, and the referenced task specifications.
The planning documents may still be uncommitted in the source checkout: read them there; follow PROTOCOL.md for copying or referencing them.
You are authorized to create your own worktree and codex/office-stories-a branch, implement all main-wave packages assigned to this lane in sequence, commit them, and open/update one draft PR.
Use the verified source HEAD as your starting point. Inspect existing attached worktrees before creating one. Never switch branches or change files in the shared source checkout.
First complete A0/A1. When producer PRs are provided, review and merge their frozen commits into your integration branch only, then implement A2/A3. Do not merge anything into the repository default branch. If producer PRs are unavailable after A1, report the completed foundation and ask for their URLs; do not invent replacement modules.
Follow the verification requirements and write the lane handoffs. Do not implement deferred packages or neighboring lanes. Do not spawn additional chats or message other chats.
Do not merge the PR into the default branch, close other PRs, or remove worktrees. Respond to the user in Russian.
```

## Диалог B

```text
Work on the office game in a dedicated managed worktree. Do not edit the shared source checkout.
Your lane is B. Read the current instructions from:
C:/Users/Nikolai S/Documents/ClaudeGames/ne-palysya/docs/plans/office-stories/parallel/LANE-B.md
Also read PROTOCOL.md and API.md in that directory, repository AGENTS.md, and the referenced task specifications.
The planning documents may still be uncommitted in the source checkout: read them there; follow PROTOCOL.md for copying or referencing them.
You are authorized to create your own worktree and codex/office-stories-b branch, implement all main-wave packages assigned to this lane in sequence, commit them, and open/update one draft PR.
Use the verified source HEAD as your starting point. Inspect existing attached worktrees before creating one. Never switch branches or change files in the shared source checkout.
Stay within your file ownership. Implement pure models using explicit context, not changes to shared runtime files. Complete every main-wave package in your lane before reporting READY. Use one commit per package, document actual APIs and tests, and freeze your branch at the reported HEAD SHA.
Follow the verification requirements and write the lane handoffs. Do not implement deferred packages or neighboring lanes. Do not spawn additional chats or message other chats.
Do not merge the PR into the default branch, close other PRs, or remove worktrees. Respond to the user in Russian.
```

## Диалог C

```text
Work on the office game in a dedicated managed worktree. Do not edit the shared source checkout.
Your lane is C. Read the current instructions from:
C:/Users/Nikolai S/Documents/ClaudeGames/ne-palysya/docs/plans/office-stories/parallel/LANE-C.md
Also read PROTOCOL.md and API.md in that directory, repository AGENTS.md, and the referenced task specifications.
The planning documents may still be uncommitted in the source checkout: read them there; follow PROTOCOL.md for copying or referencing them.
You are authorized to create your own worktree and codex/office-stories-c branch, implement all main-wave packages assigned to this lane in sequence, commit them, and open/update one draft PR.
Use the verified source HEAD as your starting point. Inspect existing attached worktrees before creating one. Never switch branches or change files in the shared source checkout.
Stay within your file ownership. Implement pure models using explicit context, not changes to shared runtime files. Complete every main-wave package in your lane before reporting READY. Use one commit per package, document actual APIs and tests, and freeze your branch at the reported HEAD SHA.
Follow the verification requirements and write the lane handoffs. Do not implement deferred packages or neighboring lanes. Do not spawn additional chats or message other chats.
Do not merge the PR into the default branch, close other PRs, or remove worktrees. Respond to the user in Russian.
```

## Диалог D

```text
Work on the office game in a dedicated managed worktree. Do not edit the shared source checkout.
Your lane is D. Read the current instructions from:
C:/Users/Nikolai S/Documents/ClaudeGames/ne-palysya/docs/plans/office-stories/parallel/LANE-D.md
Also read PROTOCOL.md and API.md in that directory, repository AGENTS.md, and the referenced task specifications.
The planning documents may still be uncommitted in the source checkout: read them there; follow PROTOCOL.md for copying or referencing them.
You are authorized to create your own worktree and codex/office-stories-d branch, implement all main-wave packages assigned to this lane in sequence, commit them, and open/update one draft PR.
Use the verified source HEAD as your starting point. Inspect existing attached worktrees before creating one. Never switch branches or change files in the shared source checkout.
Stay within your file ownership. Implement pure models using explicit context, not changes to shared runtime files. Complete every main-wave package in your lane before reporting READY. Use one commit per package, document actual APIs and tests, and freeze your branch at the reported HEAD SHA.
Follow the verification requirements and write the lane handoffs. Do not implement deferred packages or neighboring lanes. Do not spawn additional chats or message other chats.
Do not merge the PR into the default branch, close other PRs, or remove worktrees. Respond to the user in Russian.
```


## Продолжение A после завершения B/C/D

Единственные значения для подстановки — три полученные ссылки. Отправить в тот же диалог A.

```text
Continue lane A according to docs/plans/office-stories/parallel/LANE-A.md.
The producer main-wave PRs are:
B: <PR URL>
C: <PR URL>
D: <PR URL>

Verify their READY handoffs and exact HEAD SHAs, review the packages, and merge accepted frozen commits into your integration branch only.
Complete A2/A3 sequentially, run the required checks, and update the combined PR.
Do not merge into the repository default branch. If there are defects, report the exact package and issue; continue independent valid work.
Respond in Russian.
```

## Исправление производителя

Передать конкретные замечания A или итогового ревью в тот же B/C/D.

```text
Fix only these review findings in your lane: <findings>.
Preserve the agreed APIs unless the review explicitly requires a change.
Add regression coverage for the reported behavior, update your handoff and PR, and report the new HEAD SHA.
Do not reimplement other lanes or merge into the default branch. Respond in Russian.
```

## Поздняя волна

Не отправлять сейчас. После принятия основной волны C получает «выполни C5, затем C6», D — «выполни D6». A получает новые PR и выполняет поздний раздел LANE-A.
Для этого создать новые ветки от принятой общей версии в подходящих worktree, не продолжать старые уже включённые ветки без обновления базы. Основная версия должна быть слита или дан её точный принятый commit.

