async function run() {
  try {
    const { Client, handle_file } = await import('@gradio/client');
    console.log('Successfully imported! Client is:', !!Client);
  } catch (err) {
    console.error('Import error:', err);
  }
}
run();
