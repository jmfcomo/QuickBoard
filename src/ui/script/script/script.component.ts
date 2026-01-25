import { Component, OnInit } from '@angular/core';
import EditorJS from '@editorjs/editorjs';
import Header from '@editorjs/header';
import List from '@editorjs/list';

@Component({
  selector: 'app-script',
  templateUrl: './script.component.html',
  styleUrls: ['./script.component.css']
})
export class ScriptComponent implements OnInit {
  editor: EditorJS | null = null;

  ngOnInit() {
    this.initializeEditor();
  }

  private initializeEditor() {
    this.editor = new EditorJS({
      holder: 'editorjs',
      autofocus: true,
      tools: {
        header: Header,
        list: List,
      },
      placeholder: 'Start typing here...',
      data: {
        blocks: []
      }
    });
  }

}
