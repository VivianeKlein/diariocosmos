# diariocosmos

Uma pequena aplicação web para explorar a Imagem Astronômica do Dia da NASA (APOD).

## Como usar

É necessário ter Node.js 18 ou superior. No PowerShell, configure a chave no ambiente e inicie o servidor:

```powershell
$env:NASA_API_KEY = "SUA_CHAVE_DA_NASA"
node server.js
```

Abra `http://localhost:3000`. A página carrega a APOD de hoje; use o seletor para escolher outra data. O servidor consulta a API da NASA e mantém a chave fora do HTML, do JavaScript e das requisições do navegador. A chave não é armazenada no repositório; configure-a como variável de ambiente também no ambiente do servidor ao publicar a aplicação.
