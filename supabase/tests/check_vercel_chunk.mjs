async function checkVercel() {
  const indexJs = await (await fetch('https://gradely-two.vercel.app/assets/index-DN6qsDxj.js')).text();
  console.log('indexJs length:', indexJs.length);
  
  // Find chunks
  const chunkMatches = indexJs.match(/StudentDashboard-[a-zA-Z0-9_-]+\.js/g);
  console.log('StudentDashboard chunk match:', chunkMatches);

  if (chunkMatches && chunkMatches[0]) {
    const studentJs = await (await fetch('https://gradely-two.vercel.app/assets/' + chunkMatches[0])).text();
    console.log('StudentDashboard chunk length:', studentJs.length);
    console.log('Contains get_my_attendance:', studentJs.includes('get_my_attendance'));
    console.log('Contains get_my_grades:', studentJs.includes('get_my_grades'));
    
    // Check how attendance is fetched in this chunk:
    const attMatch = studentJs.match(/get_my_attendance[^\}]+(\}|\))/g);
    console.log('Snippet around get_my_attendance:', studentJs.slice(studentJs.indexOf('get_my_attendance') - 50, studentJs.indexOf('get_my_attendance') + 200));
  }
}
checkVercel();
