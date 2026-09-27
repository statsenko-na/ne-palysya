# Запуск отдельной задачи

Для четырёх параллельных диалогов вместо этого одиночного шаблона использовать [COPY-PASTE.md](parallel/COPY-PASTE.md). Каждый поток получает свою очередь и отдельный worktree.

Этот файл передавать вместе с путём одной карточки. Выбор модели остаётся у пользователя; никакой API-модели в игре нет.

## Текст для нового диалога

Ниже рабочий prompt на английском согласно AGENTS.md; ответы пользователю, документы и игровые тексты — по-русски.
Подставить точное имя файла вместо TASK_FILE.

```text
Implement only TASK_FILE in docs/plans/office-stories/tasks/.
Read repository AGENTS.md and the office-game-dev skill, then docs/plans/office-stories/COMMON.md, CONTRACTS.md, BALANCE.md, and the selected task.
Read the handoffs for its dependencies and verify that those dependencies are present in the current branch.
Inspect the actual implementation before editing; proposed API names in the specification are not existing code.
Keep a checklist of this task's acceptance criteria. Do not implement neighboring tasks or introduce a build step.
Preserve the Aljazira disaster, automatic workplace penalties, mandatory daily chores, and existing purchases.
Follow the file ownership and merge order in ORCHESTRATION.md. Use a dedicated branch if asked to create a PR; do not overwrite user changes.
Run required syntax checks and the repository QA after JavaScript changes. Run the task's focused checks. Inspect real Canvas screenshots for visual changes; do not perform additional playthroughs or bot shifts unless explicitly requested.
Update the appropriate behavior documentation, changelog and version according to the integration protocol. Fill handoffs/ID.md using HANDOFF_TEMPLATE.md.
Report in Russian: changed behavior, files, verification evidence, and remaining limitations. Do not claim completion for an unconnected module, an untested behavior, or a blocked visual gate.
If a dependency is missing, identify it precisely and do not fake its implementation.
```

## Перед передачей

- Выбрать задачу из README с выполненными зависимостями.
- Для чистой модели отсутствие подключения — ожидаемый результат карточки; указать это явно в финале.
- Для PR попросить его создание явно, если нужен PR, а не только изменение рабочего дерева.
- Для параллельной разработки выбрать только независимую группу из ORCHESTRATION.md.
- Не передавать 32 до визуального go по 30.
