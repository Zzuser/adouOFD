document.querySelectorAll('.nav-mobile a').forEach((link) => {
  link.addEventListener('click', () => {
    link.closest('details')?.removeAttribute('open')
  })
})
