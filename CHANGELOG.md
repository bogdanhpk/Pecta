# История изменений

## Unreleased

- Centered color and number variable symbols inside their frames with SVG icons, including a Figma-style hash mark.
- Added an illustrated connection flow with Figma and Pecta logos, a joining cable, animated data transfer, and reduced motion support. The illustration follows actual launcher states and stops on errors.

## 0.3.20

- Replaced the distorted Figma mark with its official monoline vector and reduced both connection-state logos for more space inside their circles.
- Centered all inspector empty states horizontally and vertically below the header, with scrolling when the window is too short.
- Simplified the Settings menu: removed Refresh properties, renamed Check for Updates, and placed the installed version beside About Pecta as a plain number.
- Added a red update indicator on the Settings button and the Check for Updates item. Opening the menu clears the button indicator for that version; the menu indicator remains until the update is installed.
- Made every inspector select compact, with width based on the selected value and consistent spacing before the chevron. Long values fit within the panel.

## 0.3.19

- Translated the inspector, launcher, About, Updates, diagnostics, and accessibility labels into English. Figma names and content keep their original language.
- Aligned select labels and chevrons, with tighter spacing in color format controls.
- Added section chevrons with a 4 px gap: right when collapsed, down when expanded.
- Removed the standalone Tokens section and internal binding paths. Token names remain next to their properties in Layout, Typography, and Colors.

## 0.3.18

- Добавлены Colors / Selection colors для выбранного блока и Assets с превью, исходными названиями и размерами ресурсов. В меню ресурса доступны PNG и SVG для иконок.
- Для текстовых слоёв добавлена схема «Ag» с размером шрифта, высотой строки и названием текстового стиля. Значения переключаются между px/rem и копируются по нажатию.
- В List добавлены сведения о текстовом стиле, токенах типографики, режимах переменных и цветах текста. Формат цвета можно переключать между Hex, RGB и HSL.

## 0.3.17

- В разделе «Обновления» появился блок «Что нового» с описанием изменений для новой версии.
- Описание поддерживает списки, заголовки и ссылки на подробности.

## 0.3.16

- В меню добавлен пункт «О Pecta» с описанием расширения, версией и информацией о создателе — Богдане Хтоминском.
- Из меню панели убрана «Диагностика доступа».

## 0.3.15

- Добавлена проверка новых сборок в GitHub и страница скачивания обновлений.
- Сборки для Chrome и Firefox публикуются автоматически через GitHub Actions.

## 0.3.14

- Добавлены иконки вариантов и переключатели True/False в свойствах компонента.
- Фон превью автоматически выбирается по цветам компонента, чтобы он не сливался с фоном.
