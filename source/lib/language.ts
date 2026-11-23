export function plural(count:number,singular:string,multiple=singular+'s'){
 return count===1?singular:multiple;
}
export function counted(count:number,singular:string,multiple=singular+'s'){
 return `${count} ${plural(count,singular,multiple)}`;
}
