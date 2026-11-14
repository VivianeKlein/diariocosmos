# diariocosmos

Uma pequena aplicação web para explorar a Imagem Astronômica do Dia da NASA (APOD).

## Como usar

Abra `index.html` no navegador ou sirva a pasta com um servidor estático local. A página carrega automaticamente a imagem do dia; use o seletor de data para explorar o arquivo.

Os dados são obtidos de `https://api.nasa.gov/planetary/apod`. Para usar sua própria chave, cole-a no campo **Sua chave da NASA** e clique em **Salvar e carregar**. Ela fica guardada no armazenamento local deste navegador; sem uma chave pessoal, a aplicação usa `DEMO_KEY`, sujeita aos limites de uso da NASA.

Como a aplicação é estática, a chave é usada no navegador e não deve ser compartilhada nem incluída no código. Para publicar o site para outras pessoas, use um backend para proteger sua chave. Não há dependências ou etapa de compilação.
