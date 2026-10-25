# Ficha para Chrome Web Store

Todo lo que pide el panel de desarrollador, listo para copiar. Las imágenes están en esta carpeta; sus fuentes, en `fuentes/` (para regenerarlas al cambiar de versión).

## Antes de empezar (lo único que no puede hacerse desde aquí)

1. Cuenta de desarrollador en el [panel de Chrome Web Store](https://chrome.google.com/webstore/devconsole): pago único de 5 USD y verificación en dos pasos en la cuenta de Google.
2. Subir el `.zip` de la [última release](https://github.com/erikarbaiza/aegis-privacy-shield/releases/latest). Ese zip ya tiene la estructura correcta (el `manifest.json` en la raíz).
3. Rellenar el panel con lo de abajo y enviar a revisión.

El `manifest.json` de este repositorio ya lleva la descripción corta de la tienda. La release v1.7.0 todavía lleva la anterior (mencionaba Copilot, que no está verificado): sube un zip hecho desde esta versión del código.

## Ficha de la tienda

**Nombre:** AEGIS Privacy Shield

**Idioma principal:** español. Si quieres ampliar, añade el inglés con el texto de más abajo.

**Categoría:** Productividad. Si el panel ofrece una de seguridad o privacidad, usa esa.

**Resumen (máx. 132 caracteres, 121 usados):**

> Cambia DNI, IBAN, claves y otros datos por etiquetas antes de enviarlos a ChatGPT, Claude o Gemini. Todo en tu navegador.

**Descripción:**

```
AEGIS Privacy Shield cambia datos personales y claves por etiquetas antes de que tu mensaje salga hacia una IA, y las repone en la respuesta para que leas el texto completo.

Ejemplo: escribes "Me llamo Lucía Fernández Ortega, mi DNI es 45612378C". La IA recibe "Me llamo [PERSON_NAME_1], mi DNI es [DNI_1]". Cuando responde, ves tu texto original.

QUÉ DETECTA
· Datos personales: email, teléfono, DNI/NIE, IBAN, tarjeta bancaria, IP pública, direcciones postales y nombres de persona.
· Credenciales: claves de API (OpenAI, Anthropic, AWS, Google, Stripe, GitHub), tokens, contraseñas en código, claves privadas y cadenas de conexión.
· Los datos con formato comprobable (IBAN, tarjeta, DNI) se validan con algoritmos para evitar falsos avisos.

DÓNDE FUNCIONA
Probada en ChatGPT, Claude, Gemini y Outlook Web con Edge. Preparada, pero sin verificar a fondo, en Copilot y Gmail.

CUATRO MODOS
Seguro (solo claves), Equilibrado (claves y datos personales), Estricto (pide confirmación antes de enviar) y Silencioso (protege sin avisos).

PRIVACIDAD
Todo se procesa en tu navegador. No hay servidor, cuentas, analíticas ni telemetría. El historial guarda tipos y recuentos, nunca los valores detectados. El código es abierto (licencia MIT).

LÍMITES, SIN LETRA PEQUEÑA
· Los nombres solo se detectan con contexto ("me llamo", "Nombre:", "Dra.", junto a un DNI). Un nombre suelto en mitad de una frase no se detecta.
· Las direcciones solo si llevan tipo de vía y número.
· AEGIS cambia lo que la web envía. La propia web ve lo que escribes en su cuadro de texto antes de que se cambie.
· Sustituir datos es seudonimización, no anonimización. No es una herramienta de cumplimiento del RGPD.
· Si una web cambia su diseño, la extensión puede dejar de funcionar hasta que se actualice.

Código, política de privacidad y comparativa con Microsoft Presidio: https://github.com/erikarbaiza/aegis-privacy-shield
```

**English summary (132 characters):**

> Swaps IDs, IBANs, API keys and other sensitive data for tags before you send them to ChatGPT, Claude or Gemini. All in your browser.

**English description:**

```
AEGIS Privacy Shield swaps personal data and secrets for tags before your message leaves for an AI, and restores them in the reply so you read the full text.

Example: you type "My name is Lucía Fernández Ortega, my ID is 45612378C". The AI receives "My name is [PERSON_NAME_1], my ID is [DNI_1]". When it answers, you see your original text.

WHAT IT DETECTS
· Personal data: email, phone, Spanish ID (DNI/NIE), IBAN, bank card, public IP, postal addresses and person names.
· Secrets: API keys (OpenAI, Anthropic, AWS, Google, Stripe, GitHub), tokens, passwords in code, private keys and connection strings.
· Data with a checkable format (IBAN, card, DNI) is validated with algorithms to avoid false alarms.

WHERE IT WORKS
Tested on ChatGPT, Claude, Gemini and Outlook Web with Edge. Prepared but not fully verified on Copilot and Gmail.

PRIVACY
Everything is processed in your browser. No server, accounts, analytics or telemetry. The history stores types and counts, never the detected values. Open source (MIT).

LIMITS
· Names are only detected from context ("my name is", "Name:", "Dr.", next to an ID). A name alone in the middle of a sentence is not detected.
· Addresses only with a street type and number.
· AEGIS changes what the website sends. The website itself sees what you type before it is changed.
· Replacing data is pseudonymisation, not anonymisation. It is not a GDPR compliance tool.
· If a site changes its design, the extension may stop working until it is updated.

The extension's interface is in Spanish only.
```

La interfaz de la extensión está solo en español. Si publicas la ficha en inglés, la última línea de la descripción avisa de ello.

## Imágenes

| Campo del panel | Archivo | Tamaño |
|---|---|---|
| Captura 1 | `captura1-antes-despues.png` | 1280×800 |
| Captura 2 | `captura2-menu.png` | 1280×800 |
| Captura 3 | `captura3-demo.png` | 1280×800 |
| Captura 4 | `captura4-limites.png` | 1280×800 |
| Imagen promocional pequeña (obligatoria) | `promo-pequena-440x280.png` | 440×280 |
| Imagen promocional grande (opcional) | `promo-grande-1400x560.png` | 1400×560 |

Todas son PNG de 24 bits sin transparencia. La captura 2 es el menú real de la extensión renderizado con datos de ejemplo; la captura 3 es la demo interactiva del repositorio. Ninguna imita la interfaz de ChatGPT, Claude o Gemini, para no atribuirles algo que no es suyo.

## Pestaña "Prácticas de privacidad"

**Propósito único:**

> Sustituir datos personales y credenciales por etiquetas en los mensajes que el usuario envía a servicios de IA y a webmail, y reponerlos en la respuesta.

**Justificación de permisos:**

- **`storage`:** guardar los ajustes (modo, sitios de confianza) y el historial local de detecciones, que contiene tipos y recuentos, nunca los valores.
- **`activeTab`:** al abrir el menú, leer la dirección de la pestaña activa para mostrar si AEGIS está activo en ella y permitir marcar el sitio como de confianza.
- **Acceso a sitios (`chatgpt.com`, `chat.openai.com`, `claude.ai`, `gemini.google.com`, `generativelanguage.googleapis.com`, `copilot.microsoft.com`, `mail.google.com`, `outlook.live.com`, `outlook.office.com`, `outlook.office365.com`):** son los únicos sitios donde la extensión actúa. Necesita leer el texto del mensaje y modificar la petición que la página envía, para cambiar los datos por etiquetas y reponerlos en la respuesta. No lee ninguna otra página.
- **Acceso opcional a otros sitios (`optional_host_permissions`):** solo se pide si el usuario configura un servidor propio de detección en el menú, y únicamente para la dirección que escribe. Por defecto no hay servidor y no se usa.

**¿Usa código remoto?** No. Todo el código va dentro del paquete. No hay `eval`, ni scripts cargados desde internet.

**Divulgación de datos.** La extensión procesa en el navegador texto escrito por el usuario que puede contener datos personales, información financiera (IBAN, tarjeta) y credenciales (claves de API). Se queda en el equipo: no se transmite a ningún servidor, salvo que el usuario configure uno propio. Ante la duda sobre si procesar en local obliga a declararlo, lo prudente es marcar estas categorías en el panel:

- Información de identificación personal.
- Información financiera y de pago.
- Información de autenticación.
- Contenido del sitio web.

Y marcar las tres certificaciones: no vender datos a terceros, no usarlos para fines ajenos a la función principal, no usarlos para decidir solvencia o préstamos. El texto exacto de las casillas cambia con el panel; revísalo al rellenarlo.

**URL de la política de privacidad:** https://erikarbaiza.github.io/aegis-privacy-shield/PRIVACY

**URL de la página de inicio:** https://erikarbaiza.github.io/aegis-privacy-shield/

**URL de soporte:** https://github.com/erikarbaiza/aegis-privacy-shield/issues

## Notas para el revisor

Para el campo de instrucciones de prueba (los revisores no tendrán tus cuentas, así que se explica cómo comprobarlo sin iniciar sesión):

```
AEGIS actúa sobre los mensajes enviados a ChatGPT, Claude, Gemini y webmail; probarlo ahí exige una cuenta. Sin cuenta:
1. Abre https://erikarbaiza.github.io/aegis-privacy-shield/demo.html. Es la misma lógica de detección de la extensión, sin salir de la página.
2. Pulsa "Nombres por contexto" o "Email + Teléfono + DNI" y verás el texto enviado con etiquetas.
Con cuenta: en chatgpt.com, escribe "Mi DNI es 12345678Z" y envíalo. Aparece un aviso verde y la respuesta repone el dato. Si la IA te describe el dato recibido, verá una etiqueta entre corchetes.
No hay inicio de sesión propio, servidor ni telemetría. El permiso opcional de acceso a otros sitios solo se pide si el usuario configura un servidor propio.
```

## Riesgos de la revisión

- **`optional_host_permissions: ["<all_urls>"]`:** es lo que más suele alargar una revisión, aunque sea opcional. Existe para el servidor propio, cuya dirección no puede conocerse de antemano. Si la tienda lo rechaza o pide cambios, la salida limpia es publicar una versión de tienda sin la opción de servidor (quitar ese permiso y el bloque del menú), y mantener el modo con servidor solo en la versión de GitHub.
- **Webs de terceros:** la extensión modifica peticiones a ChatGPT, Claude y Gemini. No hay norma que lo prohíba, pero si una de esas webs cambia su diseño la extensión puede romperse hasta publicar una versión nueva, y cada versión nueva pasa por revisión.
- **Gmail y Copilot:** están en el manifest pero sin verificar. La descripción lo dice así, para no prometer más de lo que se ha comprobado.
